import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

/**
 * Data transfer object representing a project file record.
 */
export type ProjectFileDto = Readonly<{
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: string;
}>;

type FileRow = typeof schema.projectFilesTable.$inferSelect;

function toProjectFileDto(row: FileRow): ProjectFileDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    mimeType: row.mimeType,
    name: row.name,
    projectId: row.projectId,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
  };
}

/**
 * Create (or upsert) a project file record idempotently by `(projectId, sha256)`.
 *
 * @param input - File metadata including projectId, name, mimeType, sha256 hash, size, and storage URL.
 * @returns File DTO.
 * @throws AppError - With code "db_insert_failed" if the database operation fails.
 */
export async function upsertProjectFile(
  input: Readonly<{
    projectId: string;
    name: string;
    mimeType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }>,
): Promise<ProjectFileDto> {
  const db = getDb();

  const [row] = await db
    .insert(schema.projectFilesTable)
    .values({
      mimeType: input.mimeType,
      name: input.name,
      projectId: input.projectId,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
    })
    .onConflictDoUpdate({
      set: {
        mimeType: input.mimeType,
        name: input.name,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
      },
      target: [
        schema.projectFilesTable.projectId,
        schema.projectFilesTable.sha256,
      ],
    })
    .returning();

  if (!row) {
    throw new AppError("db_insert_failed", 500, "Failed to create file.");
  }

  return toProjectFileDto(row);
}

/**
 * Get a project file by ID (cached per request).
 *
 * @param id - File ID.
 * @returns File DTO or null.
 */
export const getProjectFileById = cache(
  async (id: string): Promise<ProjectFileDto | null> => {
    const db = getDb();
    const row = await db.query.projectFilesTable.findFirst({
      where: eq(schema.projectFilesTable.id, id),
    });
    return row ? toProjectFileDto(row) : null;
  },
);

/**
 * Get a project file by (projectId, sha256) (cached per request).
 *
 * @param projectId - Project ID.
 * @param sha256 - File sha256 hex digest.
 * @returns File DTO or null.
 */
export const getProjectFileBySha256 = cache(
  async (projectId: string, sha256: string): Promise<ProjectFileDto | null> => {
    const db = getDb();
    const row = await db.query.projectFilesTable.findFirst({
      where: and(
        eq(schema.projectFilesTable.projectId, projectId),
        eq(schema.projectFilesTable.sha256, sha256),
      ),
    });
    return row ? toProjectFileDto(row) : null;
  },
);

/**
 * List files for a project ordered by newest first.
 *
 * @param projectId - Project ID.
 * @param options - Pagination options.
 * @returns File DTOs.
 */
const listProjectFilesCached = cache(
  async (
    projectId: string,
    limit: number,
    offset: number,
  ): Promise<ProjectFileDto[]> => {
    const db = getDb();
    const rows = await db.query.projectFilesTable.findMany({
      limit,
      offset,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      where: eq(schema.projectFilesTable.projectId, projectId),
    });
    return rows.map(toProjectFileDto);
  },
);

/**
 * List project files with pagination guardrails.
 *
 * @param projectId - Project ID.
 * @param options - Pagination options (limit/offset).
 * @returns File DTOs ordered by newest first.
 */
export async function listProjectFiles(
  projectId: string,
  options: Readonly<{ limit?: number; offset?: number }> = {},
): Promise<ProjectFileDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return listProjectFilesCached(projectId, limit, offset);
}
