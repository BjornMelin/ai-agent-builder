import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { ensureRunStep, getRunById } from "@/lib/data/runs.server";
import { getQstashClient } from "@/lib/upstash/qstash.server";

export type RunStepExecutionResult = Readonly<{
  runId: string;
  stepId: string;
  status:
    | "succeeded"
    | "failed"
    | "canceled"
    | "blocked"
    | "waiting"
    | "running";
  nextStepId?: string;
}>;

type StepDefinition = Readonly<{
  stepId: string;
  stepName: string;
  stepKind: "tool" | "llm" | "sandbox" | "wait" | "approval" | "external_poll";
  getNextStepId: (_runKind: "research" | "implementation") => string | null;
  run: (
    _input: Readonly<{ runId: string; projectId: string }>,
  ) => Promise<Record<string, unknown>>;
}>;

const startStep: StepDefinition = {
  getNextStepId: () => "run.complete",
  run: async () => ({ ok: true }),
  stepId: "run.start",
  stepKind: "tool",
  stepName: "Start run",
};

const completeStep: StepDefinition = {
  getNextStepId: () => null,
  run: async () => ({ ok: true }),
  stepId: "run.complete",
  stepKind: "tool",
  stepName: "Complete run",
};

const stepDefs: Readonly<Record<string, StepDefinition>> = {
  [completeStep.stepId]: completeStep,
  [startStep.stepId]: startStep,
};

function getStepDef(stepId: string): StepDefinition {
  const def = stepDefs[stepId];
  if (!def) {
    throw new AppError("bad_request", 400, `Unknown step: ${stepId}`);
  }
  return def;
}

/**
 * Enqueue a run step via QStash.
 *
 * @param input - Enqueue input.
 */
export async function enqueueRunStep(
  input: Readonly<{ origin: string; runId: string; stepId: string }>,
): Promise<void> {
  const qstash = getQstashClient();

  // QStash is the canonical orchestrator; keep the payload small and fetch any
  // additional context from Neon in the worker.
  await qstash.publishJSON({
    body: { runId: input.runId, stepId: input.stepId },
    url: `${input.origin}/api/jobs/run-step`,
  });
}

/**
 * Execute a single run step idempotently.
 *
 * This function is called from the QStash-secured Route Handler.
 *
 * @param input - Execution input.
 * @returns Step execution result.
 */
export async function executeRunStep(
  input: Readonly<{ runId: string; stepId: string; origin: string }>,
): Promise<RunStepExecutionResult> {
  const run = await getRunById(input.runId);
  if (!run) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  const def = getStepDef(input.stepId);
  const step = await ensureRunStep({
    runId: input.runId,
    stepId: def.stepId,
    stepKind: def.stepKind,
    stepName: def.stepName,
  });

  if (step.status === "succeeded") {
    return { runId: input.runId, status: "succeeded", stepId: input.stepId };
  }

  const db = getDb();
  const now = new Date();

  // Mark run as running if it hasn't started yet.
  if (run.status === "pending") {
    await db
      .update(schema.runsTable)
      .set({ status: "running", updatedAt: now })
      .where(eq(schema.runsTable.id, input.runId));
  }

  // Update the step to running.
  await db
    .update(schema.runStepsTable)
    .set({
      attempt: step.attempt + 1,
      startedAt: step.startedAt ? new Date(step.startedAt) : now,
      status: "running",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, def.stepId),
      ),
    );

  const outputs = await def.run({
    projectId: run.projectId,
    runId: input.runId,
  });

  await db
    .update(schema.runStepsTable)
    .set({
      endedAt: now,
      error: null,
      outputs,
      status: "succeeded",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, def.stepId),
      ),
    );

  const nextStepId = def.getNextStepId(run.kind);
  if (nextStepId) {
    await enqueueRunStep({
      origin: input.origin,
      runId: input.runId,
      stepId: nextStepId,
    });
    return {
      nextStepId,
      runId: input.runId,
      status: "succeeded",
      stepId: input.stepId,
    };
  }

  await db
    .update(schema.runsTable)
    .set({ status: "succeeded", updatedAt: now })
    .where(eq(schema.runsTable.id, input.runId));

  return { runId: input.runId, status: "succeeded", stepId: input.stepId };
}
