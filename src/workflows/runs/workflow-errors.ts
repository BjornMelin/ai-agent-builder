import { WorkflowRunCancelledError } from "workflow/internal/errors";

/**
 * Detect Workflow DevKit cancellations.
 *
 * @remarks
 * Workflow cancellations should be treated as user-initiated `canceled` runs,
 * not failed runs.
 *
 * @param error - Unknown error value.
 * @returns True when the error represents a workflow run cancellation.
 */
export function isWorkflowRunCancelledError(error: unknown): boolean {
  return WorkflowRunCancelledError.is(error);
}
