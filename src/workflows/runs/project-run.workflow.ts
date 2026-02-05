import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import type { RunStreamEvent } from "@/lib/runs/run-stream";
import {
  beginRunStep,
  cancelRunAndSteps,
  ensureRunStepRow,
  finishRunStep,
  getRunInfo,
  markRunRunning,
  markRunTerminal,
} from "@/workflows/runs/steps/persist.step";
import {
  closeRunStream,
  writeRunEvent,
} from "@/workflows/runs/steps/writer.step";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

function nowTimestamp(): number {
  return Date.now();
}

/**
 * Durable run workflow (Workflow DevKit).
 *
 * @remarks
 * This is the canonical orchestrator for durable runs. It writes structured
 * events to the workflow stream for UI consumption, and persists run/step state
 * to Neon via Drizzle.
 *
 * @param runId - Durable run ID stored in Neon.
 * @returns Ok result.
 */
export async function projectRun(
  runId: string,
): Promise<Readonly<{ ok: true }>> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();

  try {
    const runInfo = await getRunInfo(runId);

    const startedEvent: RunStreamEvent = {
      kind: runInfo.kind,
      runId,
      timestamp: nowTimestamp(),
      type: "run-started",
      workflowRunId,
    };

    await writeRunEvent(writable, startedEvent);
    await markRunRunning(runId);

    await ensureRunStepRow({
      runId,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
    });
    await beginRunStep({ runId, stepId: "run.start" });
    await writeRunEvent(writable, {
      runId,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
      timestamp: nowTimestamp(),
      type: "step-started",
    });
    await finishRunStep({
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.start",
    });
    await writeRunEvent(writable, {
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.start",
      timestamp: nowTimestamp(),
      type: "step-finished",
    });

    await ensureRunStepRow({
      runId,
      stepId: "run.complete",
      stepKind: "tool",
      stepName: "Complete run",
    });
    await beginRunStep({ runId, stepId: "run.complete" });
    await writeRunEvent(writable, {
      runId,
      stepId: "run.complete",
      stepKind: "tool",
      stepName: "Complete run",
      timestamp: nowTimestamp(),
      type: "step-started",
    });
    await finishRunStep({
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.complete",
    });
    await writeRunEvent(writable, {
      outputs: { ok: true },
      runId,
      status: "succeeded",
      stepId: "run.complete",
      timestamp: nowTimestamp(),
      type: "step-finished",
    });

    await markRunTerminal(runId, "succeeded");
    await writeRunEvent(writable, {
      runId,
      status: "succeeded",
      timestamp: nowTimestamp(),
      type: "run-finished",
    });

    return { ok: true };
  } catch (error) {
    const cancelled = isWorkflowRunCancelledError(error);
    try {
      if (cancelled) {
        await cancelRunAndSteps(runId);
        await writeRunEvent(writable, {
          runId,
          status: "canceled",
          timestamp: nowTimestamp(),
          type: "run-finished",
        });
      } else {
        await markRunTerminal(runId, "failed");
        await writeRunEvent(writable, {
          runId,
          status: "failed",
          timestamp: nowTimestamp(),
          type: "run-finished",
        });
      }
    } catch {
      // Best effort only; preserve original error.
    }
    throw error;
  } finally {
    try {
      await closeRunStream(writable);
    } catch {
      // Best effort only.
    }
  }
}
