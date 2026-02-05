import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import { cache } from "react";

import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";

/**
 * Data transfer object representing a single citation row.
 */
export type CitationDto = Readonly<{
  id: string;
  projectId: string;
  artifactId: string | null;
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
  createdAt: string;
}>;

type CitationRow = typeof schema.citationsTable.$inferSelect;

function toCitationDto(row: CitationRow): CitationDto {
  return {
    artifactId: row.artifactId ?? null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    payload: row.payload,
    projectId: row.projectId,
    sourceRef: row.sourceRef,
    sourceType: row.sourceType,
  };
}

/**
 * Insert citations for a specific artifact inside an existing transaction.
 *
 * @remarks
 * This helper is intentionally transaction-scoped so artifact creation and
 * citation insertion can be atomic.
 *
 * @param tx - Drizzle transaction client.
 * @param input - Citation insertion input.
 */
export async function insertArtifactCitationsTx(
  tx: DbClient,
  input: Readonly<{
    projectId: string;
    artifactId: string;
    citations: readonly Readonly<{
      sourceType: string;
      sourceRef: string;
      payload?: Record<string, unknown>;
    }>[];
  }>,
): Promise<void> {
  if (input.citations.length === 0) return;

  await tx.insert(schema.citationsTable).values(
    input.citations.map((c) => ({
      artifactId: input.artifactId,
      payload: c.payload ?? {},
      projectId: input.projectId,
      sourceRef: c.sourceRef,
      sourceType: c.sourceType,
    })),
  );
}

const listCitationsByArtifactIdCached = cache(
  async (artifactId: string): Promise<CitationDto[]> => {
    const db = getDb();
    const rows = await db.query.citationsTable.findMany({
      orderBy: (t) => [desc(t.createdAt)],
      where: eq(schema.citationsTable.artifactId, artifactId),
    });
    return rows.map(toCitationDto);
  },
);

/**
 * List citations for a single artifact version.
 *
 * @param artifactId - Artifact ID.
 * @returns Citation DTOs ordered by newest first.
 */
export async function listCitationsByArtifactId(
  artifactId: string,
): Promise<CitationDto[]> {
  return listCitationsByArtifactIdCached(artifactId);
}

/**
 * List citations for many artifacts.
 *
 * @param artifactIds - Artifact IDs.
 * @returns Citation DTOs for all artifacts ordered by newest first.
 */
export async function listCitationsByArtifactIds(
  artifactIds: readonly string[],
): Promise<CitationDto[]> {
  if (artifactIds.length === 0) return [];

  const db = getDb();
  const rows = await db.query.citationsTable.findMany({
    orderBy: (t) => [desc(t.createdAt)],
    where: inArray(schema.citationsTable.artifactId, [...artifactIds]),
  });
  return rows.map(toCitationDto);
}
