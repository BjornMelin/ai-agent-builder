import "server-only";

import { getRun, start } from "workflow/api";

import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import {
  cancelRun,
  createRun,
  getRunById,
  type RunDto,
  setRunWorkflowRunId,
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

  const wf = await start(projectRun, [run.id]);
  return await setRunWorkflowRunId(run.id, wf.runId);
}

/**
 * Cancel a durable run and its workflow execution.
 *
 * @param runId - Durable run ID.
 * @throws AppError - With code "not_found" (404) when the run does not exist.
 * @throws AppError - With code "conflict" (409) when the run has no workflow handle.
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
    throw new AppError(
      "conflict",
      409,
      "Run cannot be canceled (missing workflowRunId).",
    );
  }

  try {
    await getRun(run.workflowRunId).cancel();
  } catch {
    // Best effort only; persistence is still updated below.
  }

  await cancelRun(runId);
}
