import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getProjectSkillBundleRef } from "@/lib/ai/skills/project-skill-metadata.server";
import { tagProject, tagProjectsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { LEGACY_UNOWNED_PROJECT_OWNER_ID } from "@/lib/data/project-ownership";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * JSON-safe project DTO.
 *
 * Prefer returning DTOs (not Drizzle rows) from the DAL to avoid leaking
 * server-only fields and to keep values serializable across RSC boundaries.
 */
export type ProjectDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}>;

/** Canonical project lifecycle states. */
export type ProjectStatus = "active" | "archived" | "deleting";

/** External resources that must be removed before the project row. */
export type ProjectDeletionPlan = Readonly<{
  blobRefs: readonly string[];
  project: ProjectDto;
}>;

const ACTIVE_WORK_STATUSES = [
  "pending",
  "running",
  "waiting",
  "blocked",
] as const;
const ACTIVE_SANDBOX_JOB_STATUSES = new Set([
  "pending",
  "running",
  "canceling",
]);

function parseProjectStatus(status: string): ProjectStatus {
  if (status === "active" || status === "archived" || status === "deleting") {
    return status;
  }
  throw new AppError(
    "invalid_project_status",
    500,
    "Project has an unsupported lifecycle state.",
  );
}

function toProjectDto(row: schema.Project): ProjectDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: parseProjectStatus(row.status),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function projectOwnerAccessFilter(userId: string) {
  const filter = or(
    eq(schema.projectsTable.ownerUserId, userId),
    eq(schema.projectsTable.ownerUserId, LEGACY_UNOWNED_PROJECT_OWNER_ID),
  );
  return filter;
}

function exactProjectOwnerFilter(projectId: string, userId: string) {
  return and(
    eq(schema.projectsTable.id, projectId),
    eq(schema.projectsTable.ownerUserId, userId),
  );
}

function normalizeProjectName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 256) {
    throw new AppError(
      "invalid_input",
      400,
      "Project name must be between 1 and 256 characters.",
    );
  }
  return name;
}

function normalizeProjectSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (
    slug.length === 0 ||
    slug.length > 128 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new AppError(
      "invalid_input",
      400,
      "Project slug must be lowercase alphanumeric with optional dashes.",
    );
  }
  return slug;
}

function getAuditBundleBlobRef(
  content: Record<string, unknown>,
): string | null {
  const blobPath = content.blobPath;
  return typeof blobPath === "string" && blobPath.length > 0 ? blobPath : null;
}

/**
 * Create a new project.
 *
 * @param input - Project creation inputs.
 * @returns Created project DTO.
 * @throws AppError - When inputs are invalid or project creation fails.
 */
export async function createProject(
  input: Readonly<{ name: string; slug: string; ownerUserId: string }>,
): Promise<ProjectDto> {
  const name = normalizeProjectName(input.name);

  const ownerUserId = input.ownerUserId.trim();
  if (ownerUserId.length === 0) {
    throw new AppError("invalid_input", 400, "Project owner is required.");
  }

  const slug = normalizeProjectSlug(input.slug);

  const db = getDb();
  let row: schema.Project | undefined;
  try {
    [row] = await db
      .insert(schema.projectsTable)
      .values({ name, ownerUserId, slug })
      .returning();
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }

  if (!row) {
    throw new AppError("db_insert_failed", 500, "Failed to create project.");
  }

  return toProjectDto(row);
}

/**
 * Update the display name and slug of a project owned by the authenticated user.
 *
 * Legacy sentinel-owned projects are intentionally read-only until their owner
 * is backfilled; lifecycle mutations always require exact ownership.
 *
 * @param input - Project identity, exact owner, and new metadata.
 * @returns Updated project DTO.
 */
export async function updateProjectForUser(
  input: Readonly<{
    projectId: string;
    userId: string;
    name: string;
    slug: string;
  }>,
): Promise<ProjectDto> {
  const name = normalizeProjectName(input.name);
  const slug = normalizeProjectSlug(input.slug);
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const project = await tx.query.projectsTable.findFirst({
        where: exactProjectOwnerFilter(input.projectId, input.userId),
      });
      if (!project) {
        throw new AppError("project_not_found", 404, "Project not found.");
      }
      const status = parseProjectStatus(project.status);
      if (status === "deleting") {
        throw new AppError(
          "project_deletion_pending",
          409,
          "Project deletion is pending and cannot be changed.",
        );
      }

      const [row] = await tx
        .update(schema.projectsTable)
        .set({ name, slug, updatedAt: new Date() })
        .where(
          and(
            exactProjectOwnerFilter(input.projectId, input.userId),
            eq(schema.projectsTable.status, status),
          ),
        )
        .returning();
      if (!row) {
        throw new AppError(
          "project_status_conflict",
          409,
          "Project status changed. Refresh and try again.",
        );
      }
      return toProjectDto(row);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Archive or restore a project owned by the authenticated user.
 *
 * @param input - Project identity, exact owner, and target state.
 * @returns Updated project DTO.
 */
export async function setProjectStatusForUser(
  input: Readonly<{
    projectId: string;
    userId: string;
    status: "active" | "archived";
  }>,
): Promise<ProjectDto> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const project = await tx.query.projectsTable.findFirst({
        where: exactProjectOwnerFilter(input.projectId, input.userId),
      });
      if (!project) {
        throw new AppError("project_not_found", 404, "Project not found.");
      }

      const status = parseProjectStatus(project.status);
      if (status === "deleting") {
        throw new AppError(
          "project_deletion_pending",
          409,
          "Project deletion is pending and cannot be reversed.",
        );
      }
      if (status === input.status) return toProjectDto(project);

      if (input.status === "archived") {
        const activeRun = await tx.query.runsTable.findFirst({
          columns: { id: true },
          where: and(
            eq(schema.runsTable.projectId, input.projectId),
            inArray(schema.runsTable.status, ACTIVE_WORK_STATUSES),
          ),
        });
        const activeChat = await tx.query.chatThreadsTable.findFirst({
          columns: { id: true },
          where: and(
            eq(schema.chatThreadsTable.projectId, input.projectId),
            inArray(schema.chatThreadsTable.status, ACTIVE_WORK_STATUSES),
          ),
        });
        const sandboxJobs = await tx.query.sandboxJobsTable.findMany({
          columns: { sandboxId: true, sandboxStoppedAt: true, status: true },
          where: eq(schema.sandboxJobsTable.projectId, input.projectId),
        });
        const activeSandbox = sandboxJobs.some(
          (job) =>
            ACTIVE_SANDBOX_JOB_STATUSES.has(job.status) ||
            (job.sandboxId !== null && job.sandboxStoppedAt === null),
        );
        if (activeRun || activeChat || activeSandbox) {
          throw new AppError(
            "project_has_active_work",
            409,
            "Finish or cancel active runs, chats, and sandboxes before archiving this project.",
          );
        }
      }

      const [row] = await tx
        .update(schema.projectsTable)
        .set({ status: input.status, updatedAt: new Date() })
        .where(
          and(
            exactProjectOwnerFilter(input.projectId, input.userId),
            eq(schema.projectsTable.status, status),
          ),
        )
        .returning();
      if (!row) {
        throw new AppError(
          "project_status_conflict",
          409,
          "Project status changed. Refresh and try again.",
        );
      }
      return toProjectDto(row);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Atomically claim an archived project for irreversible deletion.
 *
 * The project-scoped advisory lock coordinates this state transition with all
 * resource-producing leases. Once claimed, metadata changes and restoration
 * are fenced while provider cleanup remains retryable.
 *
 * @param input - Project identity, exact owner, and typed slug confirmation.
 * @returns The claimed project in `deleting` state.
 */
export async function claimProjectDeletionForUser(
  input: Readonly<{
    confirmation: string;
    projectId: string;
    userId: string;
  }>,
): Promise<ProjectDto> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const project = await tx.query.projectsTable.findFirst({
        where: exactProjectOwnerFilter(input.projectId, input.userId),
      });
      if (!project) {
        throw new AppError("project_not_found", 404, "Project not found.");
      }
      if (input.confirmation.trim() !== project.slug) {
        throw new AppError(
          "project_confirmation_mismatch",
          400,
          "Type the project slug exactly to confirm deletion.",
        );
      }
      const status = parseProjectStatus(project.status);
      if (status === "deleting") return toProjectDto(project);
      if (status !== "archived") {
        throw new AppError(
          "project_not_archived",
          409,
          "Archive the project before deleting it.",
        );
      }

      const activeRun = await tx.query.runsTable.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.runsTable.projectId, input.projectId),
          inArray(schema.runsTable.status, ACTIVE_WORK_STATUSES),
        ),
      });
      const activeChat = await tx.query.chatThreadsTable.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.chatThreadsTable.projectId, input.projectId),
          inArray(schema.chatThreadsTable.status, ACTIVE_WORK_STATUSES),
        ),
      });
      const sandboxJobs = await tx.query.sandboxJobsTable.findMany({
        columns: { sandboxId: true, sandboxStoppedAt: true, status: true },
        where: eq(schema.sandboxJobsTable.projectId, input.projectId),
      });
      const activeSandbox = sandboxJobs.some(
        (job) =>
          ACTIVE_SANDBOX_JOB_STATUSES.has(job.status) ||
          (job.sandboxId !== null && job.sandboxStoppedAt === null),
      );
      if (activeRun || activeChat || activeSandbox) {
        throw new AppError(
          "project_has_active_work",
          409,
          "Finish or cancel active runs, chats, and sandboxes before deleting this project.",
        );
      }

      const [claimed] = await tx
        .update(schema.projectsTable)
        .set({ status: "deleting", updatedAt: new Date() })
        .where(
          and(
            exactProjectOwnerFilter(input.projectId, input.userId),
            eq(schema.projectsTable.status, "archived"),
          ),
        )
        .returning();
      if (!claimed) {
        throw new AppError(
          "project_status_conflict",
          409,
          "Project status changed. Refresh and try again.",
        );
      }
      return toProjectDto(claimed);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Build a retry-safe project deletion plan after enforcing lifecycle guards.
 *
 * @param input - Project identity and exact owner.
 * @returns External resources and project metadata needed for deletion.
 */
export async function prepareProjectDeletionForUser(
  input: Readonly<{ projectId: string; userId: string }>,
): Promise<ProjectDeletionPlan> {
  const db = getDb();
  try {
    const project = await db.query.projectsTable.findFirst({
      where: exactProjectOwnerFilter(input.projectId, input.userId),
    });
    if (!project) {
      throw new AppError("project_not_found", 404, "Project not found.");
    }
    if (parseProjectStatus(project.status) !== "deleting") {
      throw new AppError(
        "project_not_claimed",
        409,
        "Claim the project for deletion before cleanup.",
      );
    }

    const [files, sandboxJobs, projectSkills, auditBundles] = await Promise.all(
      [
        db.query.projectFilesTable.findMany({
          columns: { storageKey: true },
          where: eq(schema.projectFilesTable.projectId, input.projectId),
        }),
        db.query.sandboxJobsTable.findMany({
          columns: {
            sandboxId: true,
            sandboxStoppedAt: true,
            status: true,
            transcriptBlobRef: true,
          },
          where: eq(schema.sandboxJobsTable.projectId, input.projectId),
        }),
        db.query.projectSkillsTable.findMany({
          columns: { metadata: true },
          where: eq(schema.projectSkillsTable.projectId, input.projectId),
        }),
        db.query.artifactsTable.findMany({
          columns: { content: true },
          where: and(
            eq(schema.artifactsTable.projectId, input.projectId),
            eq(schema.artifactsTable.kind, "IMPLEMENTATION_AUDIT_BUNDLE"),
          ),
        }),
      ],
    );

    const blobRefs = new Set(files.map((file) => file.storageKey));
    for (const job of sandboxJobs) {
      if (job.transcriptBlobRef) blobRefs.add(job.transcriptBlobRef);
    }
    for (const skill of projectSkills) {
      const bundle = getProjectSkillBundleRef(skill.metadata);
      if (bundle) blobRefs.add(bundle.blobPath);
    }
    for (const artifact of auditBundles) {
      const blobRef = getAuditBundleBlobRef(artifact.content);
      if (blobRef) blobRefs.add(blobRef);
    }

    return {
      blobRefs: [...blobRefs],
      project: toProjectDto(project),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Delete the archived project row after its external resources are removed.
 *
 * @param input - Project identity and exact owner.
 */
export async function hardDeleteProjectForUser(
  input: Readonly<{ projectId: string; userId: string }>,
): Promise<void> {
  const db = getDb();
  let row: Readonly<{ id: string }> | undefined;
  try {
    [row] = await db
      .delete(schema.projectsTable)
      .where(
        and(
          exactProjectOwnerFilter(input.projectId, input.userId),
          eq(schema.projectsTable.status, "deleting"),
        ),
      )
      .returning({ id: schema.projectsTable.id });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }

  if (!row) {
    throw new AppError(
      "project_delete_conflict",
      409,
      "Project changed before deletion. Refresh and try again.",
    );
  }
}

/**
 * Read an exactly owned project without request caching.
 *
 * Use this at authenticated mutation boundaries. Legacy sentinel-owned
 * projects remain readable through the cached compatibility queries but are
 * never mutation authorities.
 *
 * @param id - Project identifier.
 * @param userId - Exact authenticated owner identifier.
 * @returns Exactly owned project, or `null`.
 */
export async function getOwnedProjectByIdForUser(
  id: string,
  userId: string,
): Promise<ProjectDto | null> {
  const db = getDb();
  try {
    const row = await db.query.projectsTable.findFirst({
      where: exactProjectOwnerFilter(id, userId),
    });
    return row ? toProjectDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Read an exactly owned active project without request caching.
 *
 * @param id - Project identifier.
 * @param userId - Exact authenticated owner identifier.
 * @returns The active project, or `null` for missing, legacy-owned, archived,
 * or deletion-pending projects.
 */
export async function getActiveProjectByIdForUser(
  id: string,
  userId: string,
): Promise<ProjectDto | null> {
  const db = getDb();
  try {
    const row = await db.query.projectsTable.findFirst({
      where: and(
        exactProjectOwnerFilter(id, userId),
        eq(schema.projectsTable.status, "active"),
      ),
    });
    return row ? toProjectDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Check whether a project is currently active without request caching.
 *
 * @param projectId - Project identifier.
 * @returns Whether the project exists in the active state.
 */
export async function isProjectActive(projectId: string): Promise<boolean> {
  const db = getDb();
  try {
    const row = await db.query.projectsTable.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.projectsTable.id, projectId),
        eq(schema.projectsTable.status, "active"),
      ),
    });
    return Boolean(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Get a project by ID for a specific user.
 *
 * @param id - Project ID.
 * @param userId - Authenticated user ID.
 * @returns Project DTO or null.
 * @throws AppError - With code "db_not_migrated" when the database schema is missing or outdated.
 * @throws Error - When building the project owner access filter fails.
 * @throws unknown - Re-throws unexpected database errors.
 */
export async function getProjectByIdForUser(
  id: string,
  userId: string,
): Promise<ProjectDto | null> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProject(id));
  cacheTag(tagProjectsIndex(userId));

  const db = getDb();
  let row: schema.Project | undefined;
  try {
    row = await db.query.projectsTable.findFirst({
      where: and(
        eq(schema.projectsTable.id, id),
        projectOwnerAccessFilter(userId),
      ),
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }

  return row ? toProjectDto(row) : null;
}

/**
 * Get a project by slug for a specific user.
 *
 * @param slug - Project slug.
 * @param userId - Authenticated user ID.
 * @returns Project DTO or null.
 * @throws AppError - With code "db_not_migrated" when the database schema is missing or outdated.
 * @throws Error - When building the project owner access filter fails.
 * @throws unknown - Re-throws unexpected database errors.
 */
export async function getProjectBySlugForUser(
  slug: string,
  userId: string,
): Promise<ProjectDto | null> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProjectsIndex(userId));

  const db = getDb();
  let row: schema.Project | undefined;
  try {
    row = await db.query.projectsTable.findFirst({
      where: and(
        eq(schema.projectsTable.slug, slug),
        projectOwnerAccessFilter(userId),
      ),
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
  if (row) {
    // Tag with project ID only when known; null results expire via
    // the user's projects-index tag or the "minutes" cache lifetime.
    cacheTag(tagProject(row.id));
  }

  return row ? toProjectDto(row) : null;
}

/**
 * List projects with pagination guardrails.
 *
 * @param userId - Authenticated user ID (part of the cache key).
 * @param options - Pagination options (limit/offset).
 * @returns Project DTOs ordered by newest first.
 * @throws AppError - With code "db_not_migrated" when the database schema is missing or outdated.
 * @throws Error - When building the project owner access filter fails.
 * @throws unknown - Re-throws unexpected database errors.
 */
export async function listProjects(
  userId: string,
  options: Readonly<{ limit?: number; offset?: number }> = {},
): Promise<ProjectDto[]> {
  "use cache";

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  cacheLife("minutes");
  cacheTag(tagProjectsIndex(userId));

  const db = getDb();
  try {
    const rows = await db.query.projectsTable.findMany({
      limit,
      offset,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      where: projectOwnerAccessFilter(userId),
    });
    return rows.map(toProjectDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
