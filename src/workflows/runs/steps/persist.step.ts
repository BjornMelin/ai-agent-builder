import "server-only";

import { and, eq, notInArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { cancelRunAndStepsTx } from "@/lib/data/run-cancel-tx";

type RunKind = "research" | "implementation";
type RunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";
type RunStepKind =
  | "llm"
  | "tool"
  | "sandbox"
  | "wait"
  | "approval"
  | "external_poll";

const TERMINAL_STATUSES = [
  "canceled",
  "failed",
  "succeeded",
] as const satisfies readonly RunStatus[];
type TerminalRunStatus = Extract<RunStatus, (typeof TERMINAL_STATUSES)[number]>;

type NonTerminalRunStatus = Exclude<RunStatus, TerminalRunStatus>;

/**
 * Load the minimal run info needed for orchestration.
 *
 * @param runId - Durable run ID.
 * @returns Run kind + project scope.
 * @throws AppError - With code "not_found" (404) when the run does not exist.
 */
export async function getRunInfo(
  runId: string,
): Promise<Readonly<{ kind: RunKind; projectId: string }>> {
  "use step";

  const db = getDb();
  const row = await db.query.runsTable.findFirst({
    columns: { kind: true, projectId: true },
    where: eq(schema.runsTable.id, runId),
  });

  if (!row) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  return { kind: row.kind, projectId: row.projectId };
}

/**
 * Mark a run as running (no-op for terminal statuses).
 *
 * @param runId - Durable run ID.
 */
export async function markRunRunning(runId: string): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.runsTable)
    .set({ status: "running", updatedAt: now })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        notInArray(schema.runsTable.status, [...TERMINAL_STATUSES]),
      ),
    );
}

/**
 * Mark a run as waiting (no-op for terminal statuses).
 *
 * @param runId - Durable run ID.
 */
export async function markRunWaiting(runId: string): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.runsTable)
    .set({ status: "waiting", updatedAt: now })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        notInArray(schema.runsTable.status, [...TERMINAL_STATUSES]),
      ),
    );
}

/**
 * Mark a run as blocked (no-op for terminal statuses).
 *
 * @param runId - Durable run ID.
 */
export async function markRunBlocked(runId: string): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();
  await db
    .update(schema.runsTable)
    .set({ status: "blocked", updatedAt: now })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        notInArray(schema.runsTable.status, [...TERMINAL_STATUSES]),
      ),
    );
}

/**
 * Ensure a run step exists.
 *
 * @param input - Step identity/metadata.
 */
export async function ensureRunStepRow(
  input: Readonly<{
    runId: string;
    stepId: string;
    stepKind: RunStepKind;
    stepName: string;
    inputs?: Record<string, unknown>;
  }>,
): Promise<void> {
  "use step";

  const db = getDb();

  await db
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
    });
}

/**
 * Mark a run step as running (idempotent).
 *
 * @param input - Step identity.
 * @throws AppError - With code "not_found" (404) when the run step cannot be found.
 */
export async function beginRunStep(
  input: Readonly<{ runId: string; stepId: string }>,
): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();

  const row = await db.query.runStepsTable.findFirst({
    columns: { attempt: true, status: true },
    where: and(
      eq(schema.runStepsTable.runId, input.runId),
      eq(schema.runStepsTable.stepId, input.stepId),
    ),
  });

  if (!row) {
    throw new AppError("not_found", 404, "Run step not found.");
  }

  if (
    row.status === "running" ||
    row.status === "succeeded" ||
    row.status === "canceled"
  ) {
    return;
  }

  await db
    .update(schema.runStepsTable)
    .set({
      attempt: row.attempt + 1,
      endedAt: null,
      error: null,
      outputs: {},
      startedAt: now,
      status: "running",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, input.stepId),
        notInArray(schema.runStepsTable.status, [
          "running",
          "succeeded",
          "canceled",
        ]),
      ),
    );
}

/**
 * Mark a run step as waiting/blocked (idempotent, no-op for terminal steps).
 *
 * @param input - Step identity and non-terminal status.
 * @throws AppError - With code "not_found" (404) when the run step cannot be found.
 */
export async function markRunStepStatus(
  input: Readonly<{
    runId: string;
    stepId: string;
    status: Extract<NonTerminalRunStatus, "waiting" | "blocked">;
    outputs?: Record<string, unknown>;
  }>,
): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();

  const existing = await db.query.runStepsTable.findFirst({
    columns: { status: true },
    where: and(
      eq(schema.runStepsTable.runId, input.runId),
      eq(schema.runStepsTable.stepId, input.stepId),
    ),
  });

  if (!existing) {
    throw new AppError("not_found", 404, "Run step not found.");
  }

  if (
    existing.status === "succeeded" ||
    existing.status === "canceled" ||
    (existing.status === input.status && input.outputs === undefined)
  ) {
    return;
  }

  await db
    .update(schema.runStepsTable)
    .set({
      ...(input.outputs === undefined ? {} : { outputs: input.outputs }),
      status: input.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, input.stepId),
        notInArray(schema.runStepsTable.status, ["succeeded", "canceled"]),
      ),
    );
}

/**
 * Finish a run step with outputs and optional error payload.
 *
 * @param input - Step finish payload.
 * @throws AppError - With code "not_found" (404) when the run step cannot be found.
 */
export async function finishRunStep(
  input: Readonly<{
    runId: string;
    stepId: string;
    status: TerminalRunStatus;
    outputs?: Record<string, unknown>;
    error?: Record<string, unknown> | null;
  }>,
): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();

  const existing = await db.query.runStepsTable.findFirst({
    columns: { status: true },
    where: and(
      eq(schema.runStepsTable.runId, input.runId),
      eq(schema.runStepsTable.stepId, input.stepId),
    ),
  });

  if (!existing) {
    throw new AppError("not_found", 404, "Run step not found.");
  }

  if (existing.status === "canceled" || existing.status === "succeeded") {
    return;
  }

  await db
    .update(schema.runStepsTable)
    .set({
      endedAt: now,
      error:
        input.status === "succeeded" || input.status === "canceled"
          ? null
          : (input.error ?? { message: "Failed." }),
      outputs: input.outputs ?? {},
      status: input.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, input.stepId),
        notInArray(schema.runStepsTable.status, ["canceled", "succeeded"]),
      ),
    );
}

/**
 * Mark a run status terminal (no-op for already-terminal runs).
 *
 * @param runId - Durable run ID.
 * @param status - Terminal status.
 */
export async function markRunTerminal(
  runId: string,
  status: TerminalRunStatus,
): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();

  await db
    .update(schema.runsTable)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        notInArray(schema.runsTable.status, [...TERMINAL_STATUSES]),
      ),
    );
}

/**
 * Cancel a run and mark any non-terminal steps as canceled.
 *
 * @remarks
 * This is the canonical cancellation persistence used by workflow code to avoid
 * terminal-status races (e.g., cancellation being misreported as a failure).
 *
 * @param runId - Durable run ID.
 */
export async function cancelRunAndSteps(runId: string): Promise<void> {
  "use step";

  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await cancelRunAndStepsTx(tx, { now, runId });
  });
}
