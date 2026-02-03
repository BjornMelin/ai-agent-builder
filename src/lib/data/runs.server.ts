import "server-only";

import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

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

function toRunDto(row: RunRow): RunDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    metadata: row.metadata,
    projectId: row.projectId,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
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
 * @returns Created run DTO.
 */
export async function createRun(
  input: Readonly<{
    projectId: string;
    kind: RunDto["kind"];
    metadata?: Record<string, unknown>;
  }>,
): Promise<RunDto> {
  const db = getDb();
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
 * Get a run by ID (cached per request).
 *
 * @param id - Run ID.
 * @returns Run DTO or null.
 */
export const getRunById = cache(async (id: string): Promise<RunDto | null> => {
  const db = getDb();
  const row = await db.query.runsTable.findFirst({
    where: eq(schema.runsTable.id, id),
  });
  return row ? toRunDto(row) : null;
});

/**
 * Ensure a run step exists (idempotent per runId+stepId).
 *
 * @param input - Run step inputs.
 * @returns Existing or created run step DTO.
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
export async function listRunSteps(runId: string): Promise<RunStepDto[]> {
  const db = getDb();
  const rows = await db.query.runStepsTable.findMany({
    orderBy: (t, { asc }) => [asc(t.createdAt)],
    where: eq(schema.runStepsTable.runId, runId),
  });

  return rows.map(toRunStepDto);
}
