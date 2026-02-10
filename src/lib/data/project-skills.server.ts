import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagProjectSkillsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

type ProjectSkillRow = typeof schema.projectSkillsTable.$inferSelect;

/**
 * JSON-safe project skill DTO.
 */
export type ProjectSkillDto = Readonly<{
  id: string;
  projectId: string;
  name: string;
  description: string;
  /**
   * Full SKILL.md content (including YAML frontmatter).
   */
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}>;

function toProjectSkillDto(row: ProjectSkillRow): ProjectSkillDto {
  return {
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    metadata: row.metadata,
    name: row.name,
    projectId: row.projectId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const MAX_SKILL_NAME_CHARS = 128;

function sanitizeSkillName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid skill name.");
  }
  if (trimmed.length > MAX_SKILL_NAME_CHARS) {
    throw new AppError("bad_request", 400, "Skill name too long.");
  }
  return trimmed;
}

function normalizeSkillName(value: string): string {
  return sanitizeSkillName(value).toLowerCase();
}

/**
 * List project-defined skills (oldest-first).
 *
 * @param projectId - Project ID.
 * @returns Project skill DTOs.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function listProjectSkillsByProject(
  projectId: string,
): Promise<ProjectSkillDto[]> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProjectSkillsIndex(projectId));

  const db = getDb();
  try {
    const rows = await db.query.projectSkillsTable.findMany({
      orderBy: (t) => [asc(t.createdAt)],
      where: eq(schema.projectSkillsTable.projectId, projectId),
    });
    return rows.map(toProjectSkillDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find a project skill by name (case-insensitive).
 *
 * @param projectId - Project ID.
 * @param name - Skill name.
 * @returns Matching skill or null.
 * @throws AppError - With code `"bad_request"` when `name` is empty or exceeds 128 characters.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function getProjectSkillByName(
  projectId: string,
  name: string,
): Promise<ProjectSkillDto | null> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProjectSkillsIndex(projectId));

  const db = getDb();
  try {
    const nameNorm = normalizeSkillName(name);
    const row = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, projectId),
        eq(schema.projectSkillsTable.nameNorm, nameNorm),
      ),
    });

    return row ? toProjectSkillDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find a registry-installed project skill by registry id.
 *
 * @remarks
 * This bypasses Cache Components to avoid stale reads in workflow/step contexts.
 *
 * @param projectId - Project ID.
 * @param registryId - Canonical registry identifier (`owner/repo/skillId`).
 * @returns Matching skill or null.
 * @throws AppError - With code `"bad_request"` when `registryId` is empty.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function findProjectSkillByRegistryId(
  projectId: string,
  registryId: string,
): Promise<ProjectSkillDto | null> {
  const registryIdTrimmed = registryId.trim();
  if (!registryIdTrimmed) {
    throw new AppError("bad_request", 400, "Invalid registry id.");
  }

  const db = getDb();
  try {
    const row = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, projectId),
        sql`${schema.projectSkillsTable.metadata} -> 'registry' ->> 'id' = ${registryIdTrimmed}`,
      ),
    });
    return row ? toProjectSkillDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find a project skill by name (case-insensitive) without Cache Components.
 *
 * @remarks
 * Intended for workflow/step usage where reads must reflect the latest writes.
 *
 * @param projectId - Project ID.
 * @param name - Skill name.
 * @returns Matching skill or null.
 * @throws AppError - With code `"bad_request"` when `name` is empty or exceeds 128 characters.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function findProjectSkillByNameUncached(
  projectId: string,
  name: string,
): Promise<ProjectSkillDto | null> {
  const db = getDb();
  try {
    const nameNorm = normalizeSkillName(name);
    const row = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, projectId),
        eq(schema.projectSkillsTable.nameNorm, nameNorm),
      ),
    });
    return row ? toProjectSkillDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find a project skill by id.
 *
 * @param projectId - Project ID.
 * @param skillId - Skill ID.
 * @returns Matching skill or null.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function getProjectSkillById(
  projectId: string,
  skillId: string,
): Promise<ProjectSkillDto | null> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProjectSkillsIndex(projectId));

  const db = getDb();
  try {
    const row = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, projectId),
        eq(schema.projectSkillsTable.id, skillId),
      ),
    });
    return row ? toProjectSkillDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Create or update a project skill (idempotent per projectId+name).
 *
 * @param input - Skill metadata and content.
 * @returns Upserted skill.
 * @throws AppError - With code `"bad_request"` when `input.name` is empty or exceeds 128 characters.
 * @throws AppError - With code `"db_update_failed"` when the update returned no row.
 * @throws AppError - With code `"db_insert_failed"` when the insert returned no row.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function upsertProjectSkill(
  input: Readonly<{
    projectId: string;
    name: string;
    description: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<ProjectSkillDto> {
  const db = getDb();
  const now = new Date();
  const nameTrimmed = sanitizeSkillName(input.name);
  const nameNorm = nameTrimmed.toLowerCase();

  try {
    const existing = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, input.projectId),
        eq(schema.projectSkillsTable.nameNorm, nameNorm),
      ),
    });

    if (existing) {
      const [row] = await db
        .update(schema.projectSkillsTable)
        .set({
          content: input.content,
          description: input.description,
          metadata: input.metadata ?? existing.metadata,
          name: nameTrimmed,
          nameNorm,
          updatedAt: now,
        })
        .where(eq(schema.projectSkillsTable.id, existing.id))
        .returning();

      if (!row) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to update project skill.",
        );
      }

      revalidateTag(tagProjectSkillsIndex(input.projectId), "max");
      return toProjectSkillDto(row);
    }

    const [row] = await db
      .insert(schema.projectSkillsTable)
      .values({
        content: input.content,
        description: input.description,
        metadata: input.metadata ?? {},
        name: nameTrimmed,
        nameNorm,
        projectId: input.projectId,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create project skill.",
      );
    }

    revalidateTag(tagProjectSkillsIndex(input.projectId), "max");
    return toProjectSkillDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Update a project skill by id.
 *
 * @remarks
 * This is used when an external identifier (like `metadata.registry.id`) should
 * drive updates even if the skill name changes.
 *
 * @param input - Update payload.
 * @returns Updated skill.
 * @throws AppError - With code `"bad_request"` when `input.name` is empty or exceeds 128 characters.
 * @throws AppError - With code `"not_found"` when the skill does not exist.
 * @throws AppError - With code `"conflict"` when another skill already uses the normalized name.
 * @throws AppError - With code `"db_update_failed"` when the update returned no row.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function updateProjectSkillById(
  input: Readonly<{
    projectId: string;
    skillId: string;
    name: string;
    description: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<ProjectSkillDto> {
  const db = getDb();
  const now = new Date();
  const nameTrimmed = sanitizeSkillName(input.name);
  const nameNorm = nameTrimmed.toLowerCase();

  try {
    const existing = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, input.projectId),
        eq(schema.projectSkillsTable.id, input.skillId),
      ),
    });

    if (!existing) {
      throw new AppError("not_found", 404, "Skill not found.");
    }

    const conflict = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, input.projectId),
        eq(schema.projectSkillsTable.nameNorm, nameNorm),
        sql`${schema.projectSkillsTable.id} <> ${input.skillId}`,
      ),
    });

    if (conflict) {
      throw new AppError("conflict", 409, "Skill name already exists.");
    }

    const [row] = await db
      .update(schema.projectSkillsTable)
      .set({
        content: input.content,
        description: input.description,
        metadata: input.metadata ?? existing.metadata,
        name: nameTrimmed,
        nameNorm,
        updatedAt: now,
      })
      .where(eq(schema.projectSkillsTable.id, existing.id))
      .returning();

    if (!row) {
      throw new AppError(
        "db_update_failed",
        500,
        "Failed to update project skill.",
      );
    }

    revalidateTag(tagProjectSkillsIndex(input.projectId), "max");
    return toProjectSkillDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Delete a project skill by id.
 *
 * @param input - Delete input.
 * @returns Ok result.
 * @throws AppError - With code `"not_found"` when the skill does not exist.
 * @throws AppError - With code `"db_not_migrated"` when the database schema is missing/out-of-date.
 */
export async function deleteProjectSkill(
  input: Readonly<{ projectId: string; skillId: string }>,
): Promise<Readonly<{ ok: true }>> {
  const db = getDb();

  try {
    const row = await db.query.projectSkillsTable.findFirst({
      where: and(
        eq(schema.projectSkillsTable.projectId, input.projectId),
        eq(schema.projectSkillsTable.id, input.skillId),
      ),
    });

    if (!row) {
      throw new AppError("not_found", 404, "Skill not found.");
    }

    await db
      .delete(schema.projectSkillsTable)
      .where(eq(schema.projectSkillsTable.id, row.id));

    revalidateTag(tagProjectSkillsIndex(input.projectId), "max");
    return { ok: true };
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
