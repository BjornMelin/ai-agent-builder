import "server-only";

import { and, eq, isNull, notInArray } from "drizzle-orm";
import { cache } from "react";
import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { cancelRunAndStepsTx } from "@/lib/data/run-cancel-tx";

/**
 * Data transfer object representing a workflow run.
 */
export type RunDto = Readonly<{
  id: string;
  projectId: string;
  kind: "research" | "implementation";
  status:
    | "pending"
    | "running"
    | "waiting"
    | "blocked"
    | "succeeded"
    | "failed"
    | "canceled";
  /**
   * Workflow DevKit run ID for streaming/cancel operations.
   *
   * @remarks
   * Nullable for legacy rows and for runs that failed to start.
   */
  workflowRunId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}>;

/**
 * Data transfer object representing a single step within a workflow run.
 */
export type RunStepDto = Readonly<{
  id: string;
  runId: string;
  stepId: string;
  stepName: string;
  stepKind: "llm" | "tool" | "sandbox" | "wait" | "approval" | "external_poll";
  status: RunDto["status"];
  attempt: number;
  startedAt: string | null;
  endedAt: string | null;
  error: Record<string, unknown> | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}>;

type RunRow = typeof schema.runsTable.$inferSelect;
type RunStepRow = typeof schema.runStepsTable.$inferSelect;

const TERMINAL_RUN_STATUSES = ["canceled", "failed", "succeeded"] as const;

function toRunDto(row: RunRow): RunDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    metadata: row.metadata,
    projectId: row.projectId,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    workflowRunId: row.workflowRunId ?? null,
  };
}

function toRunStepDto(row: RunStepRow): RunStepDto {
  return {
    attempt: row.attempt,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    error: row.error ?? null,
    id: row.id,
    inputs: row.inputs,
    outputs: row.outputs,
    runId: row.runId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
    stepId: row.stepId,
    stepKind: row.stepKind,
    stepName: row.stepName,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create a new run for a project.
 *
 * @param input - Run creation inputs.
 * @param db - Database client, including a lifecycle transaction when supplied.
 * @returns Created run DTO.
 * @throws AppError - With code "db_insert_failed" (500) when run creation fails.
 */
export async function createRun(
  input: Readonly<{
    projectId: string;
    kind: RunDto["kind"];
    metadata?: Record<string, unknown>;
  }>,
  db: DbClient = getDb(),
): Promise<RunDto> {
  const [row] = await db
    .insert(schema.runsTable)
    .values({
      kind: input.kind,
      metadata: input.metadata ?? {},
      projectId: input.projectId,
    })
    .returning();

  if (!row) {
    throw new AppError("db_insert_failed", 500, "Failed to create run.");
  }

  return toRunDto(row);
}

/**
 * Persist the Workflow DevKit run ID for a durable run.
 *
 * @remarks
 * This is used to reconnect to the workflow stream (and to cancel a run).
 *
 * @param runId - Durable run ID.
 * @param workflowRunId - Workflow DevKit run ID.
 * @returns Updated run DTO.
 * @throws AppError - With code "not_found" (404) when the run does not exist.
 * @throws AppError - With code "db_update_failed" (500) when the update fails.
 */
export async function setRunWorkflowRunId(
  runId: string,
  workflowRunId: string,
): Promise<RunDto> {
  const db = getDb();
  let row: RunRow | undefined;
  try {
    [row] = await db
      .update(schema.runsTable)
      .set({ updatedAt: new Date(), workflowRunId })
      .where(
        and(
          eq(schema.runsTable.id, runId),
          isNull(schema.runsTable.cancelRequestedAt),
          notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
        ),
      )
      .returning();
  } catch (error) {
    throw new AppError(
      "db_update_failed",
      500,
      "Failed to persist workflow run ID.",
      error,
    );
  }

  if (!row) {
    const existing = await db.query.runsTable.findFirst({
      columns: { id: true },
      where: eq(schema.runsTable.id, runId),
    });
    if (!existing) {
      throw new AppError("not_found", 404, "Run not found.");
    }
    throw new AppError(
      "run_not_active",
      409,
      "Run was canceled before workflow startup completed.",
    );
  }

  return toRunDto(row);
}

/**
 * List runs for a project ordered by newest first.
 *
 * @param projectId - Project ID.
 * @param limit - Maximum number of runs to return.
 * @param offset - Number of runs to skip before returning results.
 * @returns Run DTOs.
 */
const listRunsByProjectCached = cache(
  async (
    projectId: string,
    limit: number,
    offset: number,
  ): Promise<RunDto[]> => {
    const db = getDb();
    const rows = await db.query.runsTable.findMany({
      limit,
      offset,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      where: eq(schema.runsTable.projectId, projectId),
    });
    return rows.map(toRunDto);
  },
);

/**
 * List runs for a project with pagination guardrails.
 *
 * @param projectId - Project ID.
 * @param options - Pagination options (limit/offset).
 * @returns Run DTOs ordered by newest first.
 */
export async function listRunsByProject(
  projectId: string,
  options: Readonly<{ limit?: number; offset?: number }> = {},
): Promise<RunDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return listRunsByProjectCached(projectId, limit, offset);
}

async function queryRunById(id: string): Promise<RunDto | null> {
  const db = getDb();
  const row = await db.query.runsTable.findFirst({
    where: eq(schema.runsTable.id, id),
  });
  return row ? toRunDto(row) : null;
}

/**
 * Get a run by ID (cached per request).
 *
 * @param id - Run ID.
 * @returns Run DTO or null.
 */
export const getRunById = cache(queryRunById);

/**
 * Get the current committed run state without React request memoization.
 *
 * @remarks
 * Use this after a write or fence when correctness requires read-after-write
 * consistency within the same request.
 *
 * @param id - Run ID.
 * @returns Current run DTO or null.
 */
export async function getRunByIdUncached(id: string): Promise<RunDto | null> {
  return queryRunById(id);
}

/**
 * Ensure a run step exists (idempotent per runId+stepId).
 *
 * @param input - Run step inputs.
 * @returns Existing or created run step DTO.
 * @throws AppError - With code "db_insert_failed" (500) when the run step cannot be created or found.
 */
export async function ensureRunStep(
  input: Readonly<{
    runId: string;
    stepId: string;
    stepName: string;
    stepKind: RunStepDto["stepKind"];
    inputs?: Record<string, unknown>;
  }>,
): Promise<RunStepDto> {
  const db = getDb();
  const [row] = await db
    .insert(schema.runStepsTable)
    .values({
      inputs: input.inputs ?? {},
      runId: input.runId,
      stepId: input.stepId,
      stepKind: input.stepKind,
      stepName: input.stepName,
    })
    .onConflictDoNothing({
      target: [schema.runStepsTable.runId, schema.runStepsTable.stepId],
    })
    .returning();

  if (row) {
    return toRunStepDto(row);
  }

  const existing = await db.query.runStepsTable.findFirst({
    where: and(
      eq(schema.runStepsTable.runId, input.runId),
      eq(schema.runStepsTable.stepId, input.stepId),
    ),
  });

  if (!existing) {
    throw new AppError("db_insert_failed", 500, "Failed to create run step.");
  }

  return toRunStepDto(existing);
}

/**
 * List steps for a run (ordered by creation time).
 *
 * @param runId - Run ID.
 * @returns Run step DTOs.
 */
const listRunStepsCached = cache(
  async (runId: string): Promise<RunStepDto[]> => {
    const db = getDb();
    const rows = await db.query.runStepsTable.findMany({
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      where: eq(schema.runStepsTable.runId, runId),
    });

    return rows.map(toRunStepDto);
  },
);

/**
 * List steps for a run (ordered by creation time).
 *
 * @param runId - Run ID.
 * @returns Run step DTOs.
 */
export async function listRunSteps(runId: string): Promise<RunStepDto[]> {
  return listRunStepsCached(runId);
}

/**
 * Update run status by ID.
 *
 * @param runId - Run ID.
 * @param status - New status.
 */
export async function updateRunStatus(
  runId: string,
  status: RunDto["status"],
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.runsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        isNull(schema.runsTable.cancelRequestedAt),
        notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
      ),
    );
}

/**
 * Update run step status by runId + stepId.
 *
 * @param runId - Run ID.
 * @param stepId - Step ID.
 * @param status - New status.
 */
export async function updateRunStepStatus(
  runId: string,
  stepId: string,
  status: RunDto["status"],
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.runStepsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(schema.runStepsTable.runId, runId),
        eq(schema.runStepsTable.stepId, stepId),
      ),
    );
}

/**
 * Persist the durable fence that prevents new run-owned sandbox work.
 *
 * @param runId - Run ID.
 * @returns Whether this request created the fence, reused it, or found a
 * terminal run.
 * @throws AppError - With code "not_found" when the run does not exist.
 */
export async function requestRunCancellation(
  runId: string,
): Promise<"requested" | "already_requested" | "terminal"> {
  const db = getDb();
  const now = new Date();
  const [requested] = await db
    .update(schema.runsTable)
    .set({ cancelRequestedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        isNull(schema.runsTable.cancelRequestedAt),
        notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
      ),
    )
    .returning({ id: schema.runsTable.id });

  if (requested) return "requested";

  const existing = await db.query.runsTable.findFirst({
    columns: { cancelRequestedAt: true, status: true },
    where: eq(schema.runsTable.id, runId),
  });
  if (!existing) {
    throw new AppError("not_found", 404, "Run not found.");
  }
  if (TERMINAL_RUN_STATUSES.some((status) => status === existing.status)) {
    return "terminal";
  }
  if (existing.cancelRequestedAt) return "already_requested";

  throw new AppError(
    "db_update_failed",
    500,
    "Failed to request run cancellation.",
  );
}

/**
 * Complete a fenced run cancellation and cancel non-terminal steps.
 *
 * @param runId - Run ID.
 * @throws AppError - With code "not_found" (404) when the run cannot be found.
 * @throws AppError - With code "run_cancellation_not_requested" (409) when a
 * non-terminal run has not been fenced.
 */
export async function completeRunCancellation(runId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await cancelRunAndStepsTx(tx, { now, runId });
  });
}
