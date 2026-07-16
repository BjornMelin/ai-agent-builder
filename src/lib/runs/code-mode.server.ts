import "server-only";

import { start } from "workflow/api";
import { AppError } from "@/lib/core/errors";
import { getOwnedProjectByIdForUser } from "@/lib/data/projects.server";
import { getRunById, type RunDto } from "@/lib/data/runs.server";
import {
  claimCodeModeWorkflow,
  ensureCodeModeRun,
  getActiveCodeModeRunId,
} from "@/lib/runs/code-mode-start.server";
import { cancelProjectRun } from "@/lib/runs/project-run.server";
import { projectCodeMode } from "@/workflows/code-mode/project-code-mode.workflow";

const TERMINAL_RUN_STATUSES = ["canceled", "failed", "succeeded"] as const;

/**
 * Start a Code Mode session as a durable workflow run.
 *
 * @remarks
 * Code Mode runs are stored in the `runs` table (`kind: "research"`) with
 * metadata `{ origin: "code-mode", ... }` and are backed by Workflow DevKit for
 * streaming + cancellation.
 *
 * @param input - Start inputs.
 * @returns Canonical persisted run DTO. Terminal pre-start cancellations may
 * return without a Workflow ID.
 * @throws AppError - When the project does not exist or is not accessible.
 * @throws Error - When Workflow dispatch fails before self-registration.
 */
export async function startProjectCodeMode(
  input: Readonly<{
    projectId: string;
    userId: string;
    prompt: string;
    budgets?: Readonly<{ maxSteps?: number; timeoutMs?: number }> | undefined;
    networkAccess?: "none" | "restricted" | undefined;
    runId: string;
  }>,
): Promise<RunDto> {
  await ensureCodeModeRun({
    budgets: input.budgets,
    networkAccess: input.networkAccess,
    projectId: input.projectId,
    prompt: input.prompt,
    runId: input.runId,
    userId: input.userId,
  });

  const existing = await getRunById(input.runId);
  if (!existing) {
    throw new AppError("not_found", 404, "Run not found.");
  }
  if (
    existing.workflowRunId ||
    TERMINAL_RUN_STATUSES.some((status) => status === existing.status)
  ) {
    return existing;
  }

  try {
    const workflow = await start(projectCodeMode, [existing.id]);
    await claimCodeModeWorkflow(existing.id, workflow.runId);
  } catch (error) {
    // `start()` can accept a queue message before its caller receives a handle.
    // The queued workflow self-registers its generated ID as its first step, so
    // an ambiguous caller error is recoverable through this canonical run row.
    const recovered = await getRunById(existing.id);
    if (recovered?.workflowRunId) return recovered;
    throw error;
  }

  const started = await getRunById(existing.id);
  if (!started) {
    throw new AppError("not_found", 404, "Run not found.");
  }
  return started;
}

/**
 * Get the active Code Mode session run for a project.
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

  const project = await getOwnedProjectByIdForUser(run.projectId, userId);
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
 * Find the authenticated user's active Code Mode run for a project.
 *
 * @param projectId - Project UUID.
 * @param userId - Authenticated user ID.
 * @returns The active run, or `null` when no active run exists.
 */
export async function getActiveProjectCodeModeRun(
  projectId: string,
  userId: string,
): Promise<RunDto | null> {
  const project = await getOwnedProjectByIdForUser(projectId, userId);
  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }

  const runId = await getActiveCodeModeRunId(projectId, userId);
  return runId ? await getCodeModeRun(runId, userId) : null;
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
