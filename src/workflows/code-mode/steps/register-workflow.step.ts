import "server-only";

import { claimCodeModeWorkflow } from "@/lib/runs/code-mode-start.server";

/**
 * Claim canonical ownership before a Code Mode workflow performs side effects.
 *
 * @param runId - Client-known app run UUID.
 * @param workflowRunId - Native Workflow execution ID.
 * @returns Whether this Workflow owns the run.
 */
export async function registerCodeModeWorkflow(
  runId: string,
  workflowRunId: string,
): Promise<boolean> {
  "use step";

  return await claimCodeModeWorkflow(runId, workflowRunId);
}
