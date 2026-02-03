import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

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
 * @param input - File inputs.
 * @returns File DTO.
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
