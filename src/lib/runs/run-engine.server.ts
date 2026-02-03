import "server-only";

import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { ensureRunStep, getRunById } from "@/lib/data/runs.server";
import { env } from "@/lib/env";
import { getQstashClient } from "@/lib/upstash/qstash.server";

/**
 * Result of executing a run step.
 */
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

function resolveQstashOrigin(inputOrigin: string): string {
  const configured = new URL(env.app.baseUrl);
  if (
    env.runtime.nodeEnv === "production" &&
    configured.protocol !== "https:"
  ) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid QStash callback origin configuration.",
    );
  }

  if (inputOrigin) {
    try {
      const parsed = new URL(inputOrigin);
      if (parsed.origin !== configured.origin) {
        throw new AppError(
          "bad_request",
          400,
          "Request origin does not match configured callback origin.",
        );
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("bad_request", 400, "Invalid request origin.");
    }
  }

  return configured.origin;
}

function toRunStepErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: "Unknown error" };
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
  const origin = resolveQstashOrigin(input.origin);

  // QStash is the canonical orchestrator; keep the payload small and fetch any
  // additional context from Neon in the worker.
  await qstash.publishJSON({
    body: { runId: input.runId, stepId: input.stepId },
    url: `${origin}/api/jobs/run-step`,
  });
}

/**
 * Execute a single run step idempotently.
 *
 * This function is called from the QStash-secured Route Handler.
 *
 * @param input - Execution input.
 * @throws AppError - When the run is missing, the step id is invalid, or the request origin is invalid.
 * @returns Step execution result.
 */
export async function executeRunStep(
  input: Readonly<{ runId: string; stepId: string; origin: string }>,
): Promise<RunStepExecutionResult> {
  const run = await getRunById(input.runId);
  if (!run) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  if (run.status === "failed" || run.status === "canceled") {
    return { runId: input.runId, status: run.status, stepId: input.stepId };
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
  const nextStepId = def.getNextStepId(run.kind);

  if (step.status === "running") {
    return { runId: input.runId, status: "running", stepId: input.stepId };
  }

  if ((step.status === "blocked" || step.status === "waiting") && nextStepId) {
    try {
      await enqueueRunStep({
        origin: input.origin,
        runId: input.runId,
        stepId: nextStepId,
      });

      if (run.status === "blocked") {
        await db
          .update(schema.runsTable)
          .set({ status: "running", updatedAt: now })
          .where(eq(schema.runsTable.id, input.runId));
      }

      await db
        .update(schema.runStepsTable)
        .set({
          endedAt: step.endedAt ? new Date(step.endedAt) : now,
          error: null,
          status: "succeeded",
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.runStepsTable.runId, input.runId),
            eq(schema.runStepsTable.stepId, def.stepId),
          ),
        );

      return {
        nextStepId,
        runId: input.runId,
        status: "succeeded",
        stepId: input.stepId,
      };
    } catch (error) {
      await db
        .update(schema.runStepsTable)
        .set({
          error: toRunStepErrorPayload(error),
          status: "blocked",
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.runStepsTable.runId, input.runId),
            eq(schema.runStepsTable.stepId, def.stepId),
          ),
        );
      throw error;
    }
  }

  // Mark run as running if it hasn't started yet.
  if (run.status === "pending") {
    await db
      .update(schema.runsTable)
      .set({ status: "running", updatedAt: now })
      .where(eq(schema.runsTable.id, input.runId));
  }

  const [claimedStep] = await db
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
        eq(schema.runStepsTable.attempt, step.attempt),
        or(
          eq(schema.runStepsTable.status, "pending"),
          eq(schema.runStepsTable.status, "failed"),
        ),
      ),
    )
    .returning({ status: schema.runStepsTable.status });

  if (!claimedStep) {
    const latest = await db.query.runStepsTable.findFirst({
      where: and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, def.stepId),
      ),
    });

    const status = latest?.status ?? step.status;
    return {
      runId: input.runId,
      status: status === "pending" ? "running" : status,
      stepId: input.stepId,
    };
  }

  let outputs: Record<string, unknown>;
  try {
    outputs = await def.run({
      projectId: run.projectId,
      runId: input.runId,
    });
  } catch (error) {
    const endedAt = new Date();
    await db
      .update(schema.runStepsTable)
      .set({
        endedAt,
        error: toRunStepErrorPayload(error),
        status: "failed",
        updatedAt: endedAt,
      })
      .where(
        and(
          eq(schema.runStepsTable.runId, input.runId),
          eq(schema.runStepsTable.stepId, def.stepId),
        ),
      );
    await db
      .update(schema.runsTable)
      .set({ status: "failed", updatedAt: endedAt })
      .where(eq(schema.runsTable.id, input.runId));
    throw error;
  }

  await db
    .update(schema.runStepsTable)
    .set({
      endedAt: now,
      error: null,
      outputs,
      status: nextStepId ? "waiting" : "succeeded",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        eq(schema.runStepsTable.stepId, def.stepId),
      ),
    );

  if (nextStepId) {
    try {
      await enqueueRunStep({
        origin: input.origin,
        runId: input.runId,
        stepId: nextStepId,
      });
    } catch (error) {
      const blockedAt = new Date();
      await db
        .update(schema.runStepsTable)
        .set({
          error: toRunStepErrorPayload(error),
          status: "blocked",
          updatedAt: blockedAt,
        })
        .where(
          and(
            eq(schema.runStepsTable.runId, input.runId),
            eq(schema.runStepsTable.stepId, def.stepId),
          ),
        );
      await db
        .update(schema.runsTable)
        .set({ status: "blocked", updatedAt: blockedAt })
        .where(eq(schema.runsTable.id, input.runId));
      throw error;
    }

    await db
      .update(schema.runStepsTable)
      .set({ status: "succeeded", updatedAt: new Date() })
      .where(
        and(
          eq(schema.runStepsTable.runId, input.runId),
          eq(schema.runStepsTable.stepId, def.stepId),
        ),
      );
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
