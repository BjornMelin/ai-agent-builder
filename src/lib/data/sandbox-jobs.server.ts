import "server-only";

import { asc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/db/postgres-errors";

/**
 * JSON-safe sandbox job DTO.
 */
export type SandboxJobDto = Readonly<{
  id: string;
  projectId: string;
  runId: string;
  stepId: string | null;
  jobType: string;
  status: string;
  exitCode: number | null;
  transcriptBlobRef: string | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type SandboxJobRow = typeof schema.sandboxJobsTable.$inferSelect;

function toSandboxJobDto(row: SandboxJobRow): SandboxJobDto {
  return {
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    exitCode: row.exitCode ?? null,
    id: row.id,
    jobType: row.jobType,
    metadata: row.metadata,
    projectId: row.projectId,
    runId: row.runId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
    stepId: row.stepId ?? null,
    transcriptBlobRef: row.transcriptBlobRef ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function maybeWrapDbNotMigrated(err: unknown): unknown {
  if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
    return new AppError(
      "db_not_migrated",
      500,
      "Database is not migrated. Run migrations and refresh the page.",
      err,
    );
  }
  return err;
}

/**
 * Create a sandbox job record.
 *
 * @param input - Job creation payload.
 * @returns Created job DTO.
 */
export async function createSandboxJob(
  input: Readonly<{
    projectId: string;
    runId: string;
    jobType: string;
    status: string;
    metadata?: Record<string, unknown>;
    stepId?: string | null;
  }>,
): Promise<SandboxJobDto> {
  const db = getDb();
  try {
    const [row] = await db
      .insert(schema.sandboxJobsTable)
      .values({
        jobType: input.jobType,
        metadata: input.metadata ?? {},
        projectId: input.projectId,
        runId: input.runId,
        status: input.status,
        ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
      })
      .returning();

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create sandbox job.",
      );
    }

    return toSandboxJobDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Get a sandbox job by ID.
 *
 * @param jobId - Job ID.
 * @returns Job DTO or null.
 */
export const getSandboxJobById = cache(
  async (jobId: string): Promise<SandboxJobDto | null> => {
    const db = getDb();
    try {
      const row = await db.query.sandboxJobsTable.findFirst({
        where: eq(schema.sandboxJobsTable.id, jobId),
      });
      return row ? toSandboxJobDto(row) : null;
    } catch (err) {
      throw maybeWrapDbNotMigrated(err);
    }
  },
);

/**
 * List sandbox jobs for a run ordered by creation time.
 *
 * @param runId - Run ID.
 * @returns Job DTOs.
 */
export const listSandboxJobsByRun = cache(
  async (runId: string): Promise<SandboxJobDto[]> => {
    const db = getDb();
    try {
      const rows = await db.query.sandboxJobsTable.findMany({
        orderBy: (t) => [asc(t.createdAt)],
        where: eq(schema.sandboxJobsTable.runId, runId),
      });
      return rows.map(toSandboxJobDto);
    } catch (err) {
      throw maybeWrapDbNotMigrated(err);
    }
  },
);

/**
 * Update a sandbox job record.
 *
 * @param jobId - Job ID.
 * @param patch - Mutable fields to update.
 * @returns Updated job DTO.
 * @throws AppError - With code "not_found" when job does not exist.
 */
export async function updateSandboxJob(
  jobId: string,
  patch: Readonly<{
    status?: string;
    metadata?: Record<string, unknown>;
    startedAt?: Date | null;
    endedAt?: Date | null;
    exitCode?: number | null;
    transcriptBlobRef?: string | null;
  }>,
): Promise<SandboxJobDto> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await db.query.sandboxJobsTable.findFirst({
      columns: { metadata: true },
      where: eq(schema.sandboxJobsTable.id, jobId),
    });
    if (!existing) {
      throw new AppError("not_found", 404, "Sandbox job not found.");
    }

    const nextMetadata = patch.metadata
      ? { ...existing.metadata, ...patch.metadata }
      : existing.metadata;

    const [row] = await db
      .update(schema.sandboxJobsTable)
      .set({
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.startedAt === undefined
          ? {}
          : { startedAt: patch.startedAt }),
        ...(patch.endedAt === undefined ? {} : { endedAt: patch.endedAt }),
        ...(patch.exitCode === undefined ? {} : { exitCode: patch.exitCode }),
        ...(patch.transcriptBlobRef === undefined
          ? {}
          : { transcriptBlobRef: patch.transcriptBlobRef }),
        metadata: nextMetadata,
        updatedAt: now,
      })
      .where(eq(schema.sandboxJobsTable.id, jobId))
      .returning();

    if (!row) {
      throw new AppError(
        "db_update_failed",
        500,
        "Failed to update sandbox job.",
      );
    }

    return toSandboxJobDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
