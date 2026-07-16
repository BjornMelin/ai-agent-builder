import "server-only";

import { getRun, start } from "workflow/api";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { getOwnedProjectByIdForUser } from "@/lib/data/projects.server";
import {
  completeRunCancellation,
  createRun,
  getRunById,
  getRunByIdUncached,
  type RunDto,
  requestRunCancellation,
  setRunWorkflowRunId,
  updateRunStatus,
} from "@/lib/data/runs.server";
import { withActiveProjectLease } from "@/lib/projects/project-lifecycle-lease.server";
import { cancelRunSandboxes } from "@/lib/sandbox/sandbox-cancellation.server";
import { projectRun } from "@/workflows/runs/project-run.workflow";

async function cancelWorkflowExecution(
  runId: string,
  workflowRunId: string,
): Promise<unknown | null> {
  try {
    await getRun(workflowRunId).cancel();
    return null;
  } catch (error) {
    log.error("workflow_run_cancel_failed", {
      err: error,
      runId,
      workflowRunId,
    });
    return error;
  }
}

/**
 * Create and start a durable run using Workflow DevKit.
 *
 * @param input - Run creation inputs.
 * @returns Created run DTO with `workflowRunId` set.
 * @throws AppError - With code "not_found" (404) when the project does not exist.
 * @throws Error - When starting the workflow or persisting the `workflowRunId`
 * fails (errors rethrown from `start()` or `setRunWorkflowRunId()`).
 */
export async function startProjectRun(
  input: Readonly<{
    projectId: string;
    userId: string;
    kind: RunDto["kind"];
    metadata?: Record<string, unknown>;
  }>,
): Promise<RunDto> {
  const run = await withActiveProjectLease(
    { projectId: input.projectId, userId: input.userId },
    (db) =>
      createRun(
        {
          kind: input.kind,
          projectId: input.projectId,
          ...(input.metadata != null ? { metadata: input.metadata } : {}),
        },
        db,
      ),
  );

  let workflowRunId: string | null = null;
  try {
    const wf = await start(projectRun, [run.id]);
    workflowRunId = wf.runId;
    return await setRunWorkflowRunId(run.id, wf.runId);
  } catch (error) {
    if (workflowRunId) {
      try {
        await compensateStartedProjectRun({
          runId: run.id,
          workflowRunId,
        });
      } catch (compensationError) {
        log.error("run_start_compensation_failed", {
          err: compensationError,
          runId: run.id,
          workflowRunId,
        });
      }
    } else {
      try {
        await updateRunStatus(run.id, "failed");
      } catch (compensationError) {
        log.error("run_start_compensation_failed", {
          err: compensationError,
          runId: run.id,
        });
      }
    }
    throw error;
  }
}

/**
 * Compensate a Workflow that started before its app-run linkage persisted.
 *
 * @remarks
 * The durable fence is always written before external cleanup. The run becomes
 * terminal only after Workflow cancellation and sandbox cleanup both confirm;
 * otherwise it remains fenced and retryable by the canonical cancel path.
 *
 * @param input - App run and already-started Workflow IDs.
 * @throws AppError - With code "workflow_cancel_failed" when cleanup cannot be confirmed.
 */
export async function compensateStartedProjectRun(
  input: Readonly<{ runId: string; workflowRunId: string }>,
): Promise<void> {
  const cancellationState = await requestRunCancellation(input.runId);

  const workflowError = await cancelWorkflowExecution(
    input.runId,
    input.workflowRunId,
  );
  let sandboxError: unknown = null;

  try {
    await cancelRunSandboxes(input.runId);
  } catch (error) {
    sandboxError = error;
    log.error("run_sandbox_cleanup_failed", {
      err: error,
      runId: input.runId,
    });
  }

  if (workflowError || sandboxError) {
    throw new AppError(
      "workflow_cancel_failed",
      502,
      "Started workflow cleanup could not be confirmed. Retry cancellation.",
      workflowError ?? sandboxError,
    );
  }
  if (cancellationState !== "terminal") {
    await completeRunCancellation(input.runId);
  }
}

/**
 * Cancel a durable run and its workflow execution.
 *
 * @param runId - Durable run ID.
 * @param userId - Authenticated user ID.
 * @throws AppError - With code "not_found" (404) when the run does not exist.
 * @throws AppError - With code "workflow_cancel_failed" (502) when durable
 * workflow cancellation cannot be confirmed.
 */
export async function cancelProjectRun(
  runId: string,
  userId: string,
): Promise<void> {
  const run = await getRunById(runId);
  if (!run) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  const project = await getOwnedProjectByIdForUser(run.projectId, userId);
  if (!project) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  if (
    run.status === "canceled" ||
    run.status === "failed" ||
    run.status === "succeeded"
  ) {
    const workflowCancelError =
      run.status === "canceled" && run.workflowRunId
        ? await cancelWorkflowExecution(runId, run.workflowRunId)
        : null;
    await cancelRunSandboxes(runId);
    if (workflowCancelError) {
      throw new AppError(
        "workflow_cancel_failed",
        502,
        "Failed to cancel the durable workflow. Retry cancellation.",
        workflowCancelError,
      );
    }
    return;
  }

  const cancellationState = await requestRunCancellation(runId);
  // The Workflow ID may have been linked after the initial authorization read
  // but before the fence won. Once fenced, no later linkage can succeed, so this
  // fresh read is the authoritative cancellation target.
  const fencedRun = await getRunByIdUncached(runId);
  if (!fencedRun) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  const workflowCancelError =
    fencedRun.workflowRunId &&
    (cancellationState !== "terminal" || fencedRun.status === "canceled")
      ? await cancelWorkflowExecution(runId, fencedRun.workflowRunId)
      : null;

  await cancelRunSandboxes(runId);
  if (workflowCancelError) {
    throw new AppError(
      "workflow_cancel_failed",
      502,
      "Failed to cancel the durable workflow. Retry cancellation.",
      workflowCancelError,
    );
  }
  if (cancellationState !== "terminal") {
    await completeRunCancellation(runId);
  }
}
