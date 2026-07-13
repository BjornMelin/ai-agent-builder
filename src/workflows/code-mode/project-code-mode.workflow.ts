import type { UIMessageChunk } from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";
import {
  nowTimestamp,
  toStepErrorPayload,
} from "@/workflows/_shared/workflow-run-utils";
import { createCodeModeSummaryArtifact } from "@/workflows/code-mode/steps/artifacts.step";
import {
  getCodeModeRunStatus,
  runCodeModeSession,
} from "@/workflows/code-mode/steps/code-mode.step";
import { registerCodeModeWorkflow } from "@/workflows/code-mode/steps/register-workflow.step";
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

type CodeModeTerminalStatus = "succeeded" | "failed" | "canceled";

function isTerminalStatus(status: string): status is CodeModeTerminalStatus {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function isSandboxJobCanceledError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "sandbox_job_canceled"
  );
}

function getTerminalMessage(status: CodeModeTerminalStatus): string {
  switch (status) {
    case "succeeded":
      return "Code Mode completed.";
    case "failed":
      return "Code Mode failed.";
    case "canceled":
      return "Code Mode canceled.";
  }
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
  const ownsRun = await registerCodeModeWorkflow(runId, workflowRunId);
  if (!ownsRun) return { ok: true };

  const writable = getWritable<UIMessageChunk>();
  let activeStepId: string | null = null;

  async function bestEffort(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // Best effort only.
    }
  }

  async function emitTerminal(status: CodeModeTerminalStatus): Promise<void> {
    await bestEffort(async () => {
      await writeCodeModeEvent(writable, {
        message: getTerminalMessage(status),
        timestamp: nowTimestamp(),
        type: "status",
      });
    });
    await bestEffort(async () => {
      await writeCodeModeEvent(writable, {
        status,
        timestamp: nowTimestamp(),
        type: "terminal",
      });
    });
  }

  try {
    const runInfo = await getRunInfo(runId);

    await writeCodeModeEvent(writable, {
      message: "Starting Code Mode…",
      timestamp: nowTimestamp(),
      type: "status",
    });
    await markRunRunning(runId);

    type StepMeta = Readonly<{
      stepId: string;
      stepKind: "sandbox" | "tool";
      stepName: string;
      startedMessage?: string;
    }>;

    async function runPersistedStep<T>(
      meta: StepMeta,
      fn: () => Promise<T>,
    ): Promise<T> {
      await ensureRunStepRow({
        runId,
        stepId: meta.stepId,
        stepKind: meta.stepKind,
        stepName: meta.stepName,
      });
      await beginRunStep({ runId, stepId: meta.stepId });
      activeStepId = meta.stepId;

      if (meta.startedMessage) {
        await writeCodeModeEvent(writable, {
          message: meta.startedMessage,
          timestamp: nowTimestamp(),
          type: "status",
        });
      }

      const result = await fn();
      const outputs =
        typeof result === "object" && result !== null
          ? (result as unknown as Record<string, unknown>)
          : { value: result };

      await finishRunStep({
        outputs,
        runId,
        status: "succeeded",
        stepId: meta.stepId,
      });
      activeStepId = null;
      return result;
    }

    const sessionOutputs = await runPersistedStep(
      {
        startedMessage: "Sandbox session running…",
        stepId: "code_mode.session",
        stepKind: "sandbox",
        stepName: "Run Code Mode session",
      },
      async () =>
        await runCodeModeSession({
          runId,
          workflowRunId,
          writable,
        }),
    );

    await runPersistedStep(
      {
        stepId: "artifact.code_mode_summary",
        stepKind: "tool",
        stepName: "Persist Code Mode summary artifact",
      },
      async () =>
        await createCodeModeSummaryArtifact({
          assistantText: sessionOutputs.assistantText,
          projectId: runInfo.projectId,
          prompt: sessionOutputs.prompt,
          runId,
          transcriptBlobRef: sessionOutputs.transcriptBlobRef,
          workflowRunId,
        }),
    );

    await markRunTerminal(runId, "succeeded");
    const persistedStatus = await getCodeModeRunStatus(runId);
    if (persistedStatus !== "succeeded") {
      throw new Error(
        `Code Mode success lost the terminal-state race to ${persistedStatus}.`,
      );
    }
    await emitTerminal(persistedStatus);

    return { ok: true };
  } catch (error) {
    const cancelled =
      isWorkflowRunCancelledError(error) || isSandboxJobCanceledError(error);

    async function finishActiveStepFailed(): Promise<void> {
      if (activeStepId === null) return;

      const stepError = toStepErrorPayload(error);
      await finishRunStep({
        error: stepError,
        runId,
        status: "failed",
        stepId: activeStepId,
      });
    }

    let persistedStatus: CodeModeTerminalStatus | null = null;
    try {
      if (cancelled) {
        await cancelRunAndSteps(runId);
      } else {
        await finishActiveStepFailed();
        await markRunTerminal(runId, "failed");
      }

      const status = await getCodeModeRunStatus(runId);
      if (isTerminalStatus(status)) {
        persistedStatus = status;
      }
    } catch {
      // Never emit a terminal event that was not confirmed in durable state.
    }

    if (persistedStatus) await emitTerminal(persistedStatus);
    throw error;
  } finally {
    await bestEffort(async () => await closeCodeModeStream(writable));
  }
}
