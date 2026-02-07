import "server-only";

import { and, eq, or } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagProject, tagProjectsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { LEGACY_UNOWNED_PROJECT_OWNER_ID } from "@/lib/data/project-ownership";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/db/postgres-errors";

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
  status: string;
  createdAt: string;
  updatedAt: string;
}>;

function toProjectDto(row: schema.Project): ProjectDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
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
  const name = input.name.trim();
  if (name.length === 0 || name.length > 256) {
    throw new AppError(
      "invalid_input",
      400,
      "Project name must be between 1 and 256 characters.",
    );
  }

  const ownerUserId = input.ownerUserId.trim();
  if (ownerUserId.length === 0) {
    throw new AppError("invalid_input", 400, "Project owner is required.");
  }

  const slug = input.slug.trim().toLowerCase();
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

  const db = getDb();
  let row: schema.Project | undefined;
  try {
    [row] = await db
      .insert(schema.projectsTable)
      .values({ name, ownerUserId, slug })
      .returning();
  } catch (err) {
    if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and refresh the page.",
        err,
      );
    }
    throw err;
  }

  if (!row) {
    throw new AppError("db_insert_failed", 500, "Failed to create project.");
  }

  return toProjectDto(row);
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
    if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and refresh the page.",
        err,
      );
    }
    throw err;
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
    if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and refresh the page.",
        err,
      );
    }
    throw err;
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
    if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and refresh the page.",
        err,
      );
    }
    throw err;
  }
}
