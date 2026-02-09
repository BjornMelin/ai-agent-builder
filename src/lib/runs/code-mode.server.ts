import "server-only";

import { getRun, start } from "workflow/api";

import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import {
  createRun,
  getRunById,
  type RunDto,
  setRunWorkflowRunId,
  updateRunStatus,
} from "@/lib/data/runs.server";
import { cancelProjectRun } from "@/lib/runs/project-run.server";
import { projectCodeMode } from "@/workflows/code-mode/project-code-mode.workflow";

/**
 * Start a Code Mode session as a durable workflow run.
 *
 * @remarks
 * Code Mode runs are stored in the `runs` table (`kind: "research"`) with
 * metadata `{ origin: "code-mode", ... }` and are backed by Workflow DevKit for
 * streaming + cancellation.
 *
 * @param input - Start inputs.
 * @returns Persisted run DTO with `workflowRunId` set.
 * @throws AppError - When the project does not exist or is not accessible.
 * @throws Error - When starting the workflow or persisting the workflowRunId fails.
 */
export async function startProjectCodeMode(
  input: Readonly<{
    projectId: string;
    userId: string;
    prompt: string;
    budgets?: Readonly<{ maxSteps?: number; timeoutMs?: number }> | undefined;
    networkAccess?: "none" | "restricted" | undefined;
  }>,
): Promise<RunDto> {
  const project = await getProjectByIdForUser(input.projectId, input.userId);
  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }

  const run = await createRun({
    kind: "research",
    metadata: {
      networkAccess: input.networkAccess ?? "none",
      origin: "code-mode",
      prompt: input.prompt,
      ...(input.budgets ? { budgets: input.budgets } : {}),
    },
    projectId: input.projectId,
  });

  let workflowRunId: string | null = null;
  try {
    const wf = await start(projectCodeMode, [run.id]);

    workflowRunId = wf.runId;
    try {
      return await setRunWorkflowRunId(run.id, wf.runId);
    } catch (error) {
      if (workflowRunId) {
        try {
          await getRun(workflowRunId).cancel();
        } catch (cancelError) {
          log.error("workflow_run_cancel_failed", {
            err: cancelError,
            runId: run.id,
            workflowRunId,
          });
        }
      }
      throw error;
    }
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
 * Get the active Code Mode session run for a project.
 *
 * @remarks
 * This is a convenience helper for future UI improvements; it is not currently
 * used by the Route Handlers.
 *
 * @param runId - Run ID.
 * @param userId - User ID.
 * @returns Run DTO.
 * @throws AppError - When run is not found or not accessible.
 */
export async function getCodeModeRun(
  runId: string,
  userId: string,
): Promise<RunDto> {
  const run = await getRunById(runId);
  if (!run) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  const project = await getProjectByIdForUser(run.projectId, userId);
  if (!project) {
    throw new AppError("forbidden", 403, "Forbidden.");
  }

  const origin = run.metadata?.origin;
  if (origin !== "code-mode") {
    throw new AppError("not_found", 404, "Run not found.");
  }

  return run;
}

/**
 * Cancel an in-flight Code Mode run.
 *
 * @param runId - Run ID.
 * @param userId - Authenticated user ID.
 * @throws AppError - With code "not_found" when run is missing or not Code Mode.
 */
export async function cancelProjectCodeMode(
  runId: string,
  userId: string,
): Promise<void> {
  await getCodeModeRun(runId, userId);
  await cancelProjectRun(runId, userId);
}
