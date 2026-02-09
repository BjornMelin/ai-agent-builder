import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { createCodeModeSummaryArtifact } from "@/workflows/code-mode/steps/artifacts.step";
import { runCodeModeSession } from "@/workflows/code-mode/steps/code-mode.step";
import {
  closeCodeModeStream,
  writeCodeModeEvent,
} from "@/workflows/code-mode/steps/writer.step";
import {
  beginRunStep,
  cancelRunAndSteps,
  ensureRunStepRow,
  finishRunStep,
  getRunInfo,
  markRunRunning,
  markRunTerminal,
} from "@/workflows/runs/steps/persist.step";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

function nowTimestamp(): number {
  return Date.now();
}

function toStepErrorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message || "Failed." };
  }

  if (typeof error === "string" && error.length > 0) {
    return { message: error };
  }

  return { message: "Failed." };
}

/**
 * Durable Code Mode workflow (Workflow DevKit).
 *
 * @remarks
 * Executes an AI-assisted sandbox session and streams UI chunks using the AI
 * SDK stream response format (resumable with `startIndex`).
 *
 * @param runId - Durable run id stored in Neon.
 * @returns Ok result.
 */
export async function projectCodeMode(
  runId: string,
): Promise<Readonly<{ ok: true }>> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  let activeStepId: string | null = null;

  try {
    const runInfo = await getRunInfo(runId);

    await writeCodeModeEvent(writable, {
      message: "Starting Code Mode…",
      timestamp: nowTimestamp(),
      type: "status",
    });
    await markRunRunning(runId);

    await ensureRunStepRow({
      runId,
      stepId: "code_mode.session",
      stepKind: "sandbox",
      stepName: "Run Code Mode session",
    });
    await beginRunStep({ runId, stepId: "code_mode.session" });
    activeStepId = "code_mode.session";
    await writeCodeModeEvent(writable, {
      message: "Sandbox session running…",
      timestamp: nowTimestamp(),
      type: "status",
    });
    const sessionOutputs = await runCodeModeSession({
      runId,
      workflowRunId,
      writable,
    });
    await finishRunStep({
      outputs: { ...sessionOutputs },
      runId,
      status: "succeeded",
      stepId: "code_mode.session",
    });
    activeStepId = null;

    await ensureRunStepRow({
      runId,
      stepId: "artifact.code_mode_summary",
      stepKind: "tool",
      stepName: "Persist Code Mode summary artifact",
    });
    await beginRunStep({ runId, stepId: "artifact.code_mode_summary" });
    activeStepId = "artifact.code_mode_summary";
    const artifactOutputs = await createCodeModeSummaryArtifact({
      assistantText: sessionOutputs.assistantText,
      projectId: runInfo.projectId,
      prompt: sessionOutputs.prompt,
      runId,
      transcriptBlobRef: sessionOutputs.transcriptBlobRef,
      workflowRunId,
    });
    await finishRunStep({
      outputs: { ...artifactOutputs },
      runId,
      status: "succeeded",
      stepId: "artifact.code_mode_summary",
    });
    activeStepId = null;

    await markRunTerminal(runId, "succeeded");
    await writeCodeModeEvent(writable, {
      message: "Code Mode completed.",
      timestamp: nowTimestamp(),
      type: "status",
    });

    return { ok: true };
  } catch (error) {
    const cancelled = isWorkflowRunCancelledError(error);
    try {
      if (cancelled) {
        if (activeStepId !== null) {
          await finishRunStep({
            runId,
            status: "canceled",
            stepId: activeStepId,
          });
          await writeCodeModeEvent(writable, {
            message: "Code Mode canceled.",
            timestamp: nowTimestamp(),
            type: "status",
          });
        }
        await cancelRunAndSteps(runId);
      } else {
        if (activeStepId !== null) {
          try {
            const stepError = toStepErrorPayload(error);
            await finishRunStep({
              error: stepError,
              runId,
              status: "failed",
              stepId: activeStepId,
            });
          } catch {
            // Best effort only.
          }
        }

        await markRunTerminal(runId, "failed");
        await writeCodeModeEvent(writable, {
          message: "Code Mode failed.",
          timestamp: nowTimestamp(),
          type: "status",
        });
      }
    } catch {
      // Best effort only; preserve original error.
    }
    throw error;
  } finally {
    try {
      await closeCodeModeStream(writable);
    } catch {
      // Best effort only.
    }
  }
}
