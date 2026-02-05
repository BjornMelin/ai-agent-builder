import "server-only";

import { getRun, start } from "workflow/api";

import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { getProjectById } from "@/lib/data/projects.server";
import {
  cancelRun,
  createRun,
  getRunById,
  type RunDto,
  setRunWorkflowRunId,
  updateRunStatus,
} from "@/lib/data/runs.server";
import { projectRun } from "@/workflows/runs/project-run.workflow";

/**
 * Create and start a durable run using Workflow DevKit.
 *
 * @param input - Run creation inputs.
 * @returns Created run DTO with `workflowRunId` set.
 * @throws AppError - With code "not_found" (404) when the project does not exist.
 */
export async function startProjectRun(
  input: Readonly<{
    projectId: string;
    kind: RunDto["kind"];
    metadata?: Record<string, unknown>;
  }>,
): Promise<RunDto> {
  const project = await getProjectById(input.projectId);
  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }

  const run = await createRun({
    kind: input.kind,
    projectId: input.projectId,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });

  try {
    const wf = await start(projectRun, [run.id]);
    return await setRunWorkflowRunId(run.id, wf.runId);
  } catch (error) {
    try {
      await updateRunStatus(run.id, "failed");
    } catch (compensationError) {
      log.error("run_start_compensation_failed", {
        err: compensationError,
        runId: run.id,
      });
    }
    throw error;
  }
}

/**
 * Cancel a durable run and its workflow execution.
 *
 * @param runId - Durable run ID.
 * @throws AppError - With code "not_found" (404) when the run does not exist.
 */
export async function cancelProjectRun(runId: string): Promise<void> {
  const run = await getRunById(runId);
  if (!run) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  if (
    run.status === "canceled" ||
    run.status === "failed" ||
    run.status === "succeeded"
  ) {
    return;
  }

  if (!run.workflowRunId) {
    await cancelRun(runId);
    return;
  }

  try {
    await getRun(run.workflowRunId).cancel();
  } catch (error) {
    log.error("workflow_run_cancel_failed", {
      err: error,
      runId,
      workflowRunId: run.workflowRunId,
    });
  }

  await cancelRun(runId);
}
