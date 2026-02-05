import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { insertArtifactCitationsTx } from "@/lib/data/citations.server";

/**
 * Data transfer object representing a single versioned artifact row.
 */
export type ArtifactDto = Readonly<{
  id: string;
  projectId: string;
  runId: string | null;
  kind: string;
  logicalKey: string;
  version: number;
  content: Record<string, unknown>;
  createdAt: string;
}>;

type ArtifactRow = typeof schema.artifactsTable.$inferSelect;

function toArtifactDto(row: ArtifactRow): ArtifactDto {
  return {
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    logicalKey: row.logicalKey,
    projectId: row.projectId,
    runId: row.runId ?? null,
    version: row.version,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: unknown }).code === "23505";
}

async function maxArtifactVersionTx(
  tx: DbClient,
  input: Readonly<{ projectId: string; kind: string; logicalKey: string }>,
): Promise<number> {
  const [row] = await tx
    .select({
      maxVersion: sql<number | null>`max(${schema.artifactsTable.version})`,
    })
    .from(schema.artifactsTable)
    .where(
      and(
        eq(schema.artifactsTable.projectId, input.projectId),
        eq(schema.artifactsTable.kind, input.kind),
        eq(schema.artifactsTable.logicalKey, input.logicalKey),
      ),
    );

  return row?.maxVersion ?? 0;
}

/**
 * Create the next monotonic version of an artifact (atomic with citations).
 *
 * @remarks
 * This function guarantees monotonic versioning per `(projectId, kind, logicalKey)`
 * using a transaction + retry on unique constraint violations.
 *
 * @param tx - Drizzle transaction client.
 * @param input - Artifact creation input.
 * @returns Created artifact DTO.
 * @throws AppError - With code "db_insert_failed" when insertion fails.
 */
export async function createArtifactVersionTx(
  tx: DbClient,
  input: Readonly<{
    projectId: string;
    runId?: string | null;
    kind: string;
    logicalKey: string;
    content: Record<string, unknown>;
    citations?: readonly Readonly<{
      sourceType: string;
      sourceRef: string;
      payload?: Record<string, unknown>;
    }>[];
  }>,
): Promise<ArtifactDto> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextVersion =
      (await maxArtifactVersionTx(tx, {
        kind: input.kind,
        logicalKey: input.logicalKey,
        projectId: input.projectId,
      })) + 1;

    try {
      const [row] = await tx
        .insert(schema.artifactsTable)
        .values({
          content: input.content,
          kind: input.kind,
          logicalKey: input.logicalKey,
          projectId: input.projectId,
          runId: input.runId ?? null,
          version: nextVersion,
        })
        .returning();

      if (!row) {
        throw new AppError(
          "db_insert_failed",
          500,
          "Failed to create artifact.",
        );
      }

      const citations = input.citations ?? [];
      await insertArtifactCitationsTx(tx, {
        artifactId: row.id,
        citations,
        projectId: input.projectId,
      });

      return toArtifactDto(row);
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError("db_insert_failed", 500, "Failed to create artifact.");
}

/**
 * Create the next monotonic version of an artifact (atomic with citations).
 *
 * @param input - Artifact creation input.
 * @returns Created artifact DTO.
 * @throws AppError - With code "db_insert_failed" (500) when insertion fails.
 */
export async function createArtifactVersion(
  input: Parameters<typeof createArtifactVersionTx>[1],
): Promise<ArtifactDto> {
  const db = getDb();
  return await db.transaction(
    async (tx) => await createArtifactVersionTx(tx, input),
  );
}

/**
 * Get an artifact version by ID.
 *
 * @param artifactId - Artifact ID.
 * @returns Artifact DTO or null.
 */
export const getArtifactById = cache(
  async (artifactId: string): Promise<ArtifactDto | null> => {
    const db = getDb();
    const row = await db.query.artifactsTable.findFirst({
      where: eq(schema.artifactsTable.id, artifactId),
    });
    return row ? toArtifactDto(row) : null;
  },
);

/**
 * List the latest version of every artifact key in a project.
 *
 * @remarks
 * Uses `DISTINCT ON` for stable "latest per key" behavior.
 *
 * @param projectId - Project ID.
 * @param options - Optional pagination options.
 * @returns Latest artifact versions ordered deterministically by kind + logicalKey.
 */
export async function listLatestArtifacts(
  projectId: string,
  options: Readonly<{ limit?: number }> = {},
): Promise<ArtifactDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const db = getDb();

  const result = await db.execute<ArtifactRow>(sql`
    SELECT DISTINCT ON (kind, logical_key)
      id, project_id, run_id, kind, logical_key, version, content, created_at
    FROM artifacts
    WHERE project_id = ${projectId}
    ORDER BY kind ASC, logical_key ASC, version DESC
    LIMIT ${limit};
  `);

  return result.rows.map(toArtifactDto);
}

/**
 * List all versions of an artifact key (newest first).
 *
 * @param projectId - Project ID.
 * @param key - Artifact key.
 * @param options - Optional pagination options.
 * @returns Artifact versions ordered by version descending.
 */
export async function listArtifactVersions(
  projectId: string,
  key: Readonly<{ kind: string; logicalKey: string }>,
  options: Readonly<{ limit?: number }> = {},
): Promise<ArtifactDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const db = getDb();
  const rows = await db.query.artifactsTable.findMany({
    limit,
    orderBy: (t) => [desc(t.version)],
    where: and(
      eq(schema.artifactsTable.projectId, projectId),
      eq(schema.artifactsTable.kind, key.kind),
      eq(schema.artifactsTable.logicalKey, key.logicalKey),
    ),
  });
  return rows.map(toArtifactDto);
}
