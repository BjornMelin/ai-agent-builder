import "server-only";

import { eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  tagArtifactsIndex,
  tagProject,
  tagUploadsIndex,
} from "@/lib/cache/tags";
import type { RunDto } from "@/lib/data/runs.server";

const RUN_STATUSES: ReadonlyArray<RunDto["status"]> = [
  "pending",
  "running",
  "waiting",
  "blocked",
  "succeeded",
  "failed",
  "canceled",
];

/**
 * Snapshot of project upload + indexing health signals for the overview UI.
 */
export type ProjectCorpusOverview = Readonly<{
  totalBytes: number;
  totalFiles: number;
  lastUploadAt: string | null;
  indexedChunks: number;
  indexedFiles: number;
  indexedTokens: number;
}>;

/**
 * Read upload + ingestion/indexing signals for a project.
 *
 * @remarks
 * This is designed for the project overview cards (small, actionable summaries).
 * It intentionally avoids returning sensitive data and only exposes aggregate totals.
 *
 * @param projectId - Project identifier.
 * @returns Overview snapshot of uploads + indexed corpus.
 */
export async function getProjectCorpusOverview(
  projectId: string,
): Promise<ProjectCorpusOverview> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProject(projectId));
  cacheTag(tagUploadsIndex(projectId));

  const db = getDb();

  const result = await db.execute<{
    total_bytes: unknown;
    total_files: unknown;
    last_upload_at: Date | null;
    indexed_chunks: unknown;
    indexed_files: unknown;
    indexed_tokens: unknown;
  }>(sql`
    SELECT
      (SELECT COALESCE(SUM(size_bytes), 0) FROM project_files WHERE project_id = ${projectId}) AS total_bytes,
      (SELECT COUNT(*) FROM project_files WHERE project_id = ${projectId}) AS total_files,
      (SELECT MAX(created_at) FROM project_files WHERE project_id = ${projectId}) AS last_upload_at,
      (SELECT COUNT(*) FROM file_chunks WHERE project_id = ${projectId}) AS indexed_chunks,
      (SELECT COUNT(DISTINCT file_id) FROM file_chunks WHERE project_id = ${projectId}) AS indexed_files,
      (SELECT COALESCE(SUM(token_count), 0) FROM file_chunks WHERE project_id = ${projectId}) AS indexed_tokens;
  `);

  const row = result.rows[0];

  return {
    indexedChunks: Number(row?.indexed_chunks ?? 0),
    indexedFiles: Number(row?.indexed_files ?? 0),
    indexedTokens: Number(row?.indexed_tokens ?? 0),
    lastUploadAt: row?.last_upload_at ? row.last_upload_at.toISOString() : null,
    totalBytes: Number(row?.total_bytes ?? 0),
    totalFiles: Number(row?.total_files ?? 0),
  };
}

/**
 * Snapshot of project run health signals for the overview UI.
 */
export type ProjectRunOverview = Readonly<{
  totalRuns: number;
  statusCounts: Readonly<Record<RunDto["status"], number>>;
  lastRun: Readonly<{
    id: string;
    kind: RunDto["kind"];
    status: RunDto["status"];
    createdAt: string;
    updatedAt: string;
  }> | null;
}>;

/**
 * Read run health signals for a project (counts + latest run).
 *
 * @param projectId - Project identifier.
 * @returns Overview snapshot of run activity.
 */
export async function getProjectRunOverview(
  projectId: string,
): Promise<ProjectRunOverview> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProject(projectId));

  const db = getDb();

  const countResult = await db.execute<{
    status: RunDto["status"];
    count: unknown;
  }>(sql`
    SELECT status, COUNT(*) AS count
    FROM runs
    WHERE project_id = ${projectId}
    GROUP BY status;
  `);

  const statusCounts = Object.fromEntries(
    RUN_STATUSES.map((status) => [status, 0]),
  ) as Record<RunDto["status"], number>;

  for (const row of countResult.rows) {
    statusCounts[row.status] = Number(row.count ?? 0);
  }

  const totalRuns = RUN_STATUSES.reduce(
    (acc, status) => acc + statusCounts[status],
    0,
  );

  const lastRunRow = await db.query.runsTable.findFirst({
    columns: {
      createdAt: true,
      id: true,
      kind: true,
      status: true,
      updatedAt: true,
    },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    where: eq(schema.runsTable.projectId, projectId),
  });

  return {
    lastRun: lastRunRow
      ? {
          createdAt: lastRunRow.createdAt.toISOString(),
          id: lastRunRow.id,
          kind: lastRunRow.kind,
          status: lastRunRow.status,
          updatedAt: lastRunRow.updatedAt.toISOString(),
        }
      : null,
    statusCounts,
    totalRuns,
  };
}

/**
 * Snapshot of project artifact signals for the overview UI.
 */
export type ProjectArtifactOverview = Readonly<{
  latestKeys: number;
  lastArtifact: Readonly<{
    id: string;
    kind: string;
    logicalKey: string;
    version: number;
    createdAt: string;
  }> | null;
}>;

/**
 * Read artifact signals for a project (latest artifact + latest-key count).
 *
 * @param projectId - Project identifier.
 * @returns Overview snapshot of artifacts.
 */
export async function getProjectArtifactOverview(
  projectId: string,
): Promise<ProjectArtifactOverview> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProject(projectId));
  cacheTag(tagArtifactsIndex(projectId));

  const db = getDb();

  const keysResult = await db.execute<{ count: unknown }>(sql`
    SELECT COUNT(*) AS count
    FROM (
      SELECT DISTINCT ON (kind, logical_key) id
      FROM artifacts
      WHERE project_id = ${projectId}
      ORDER BY kind ASC, logical_key ASC, version DESC
    ) latest;
  `);

  const latestKeys = Number(keysResult.rows[0]?.count ?? 0);

  const lastArtifactRow = await db.query.artifactsTable.findFirst({
    columns: {
      createdAt: true,
      id: true,
      kind: true,
      logicalKey: true,
      version: true,
    },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    where: eq(schema.artifactsTable.projectId, projectId),
  });

  return {
    lastArtifact: lastArtifactRow
      ? {
          createdAt: lastArtifactRow.createdAt.toISOString(),
          id: lastArtifactRow.id,
          kind: lastArtifactRow.kind,
          logicalKey: lastArtifactRow.logicalKey,
          version: lastArtifactRow.version,
        }
      : null,
    latestKeys,
  };
}
