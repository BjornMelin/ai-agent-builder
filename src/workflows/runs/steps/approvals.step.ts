import "server-only";

import { createApprovalRequest } from "@/lib/data/approvals.server";

/**
 * Minimal approval request identity returned to workflows.
 */
export type ApprovalRequestRef = Readonly<{
  approvalId: string;
  scope: string;
}>;

/**
 * Create (or reuse) an approval request for a run.
 *
 * @remarks
 * Wrapped in a Workflow DevKit step to avoid duplicate approvals during
 * deterministic replays.
 *
 * @param input - Approval request identity and metadata.
 * @returns Approval request reference.
 */
export async function ensureApprovalRequest(
  input: Readonly<{
    projectId: string;
    runId: string;
    scope: string;
    intentSummary: string;
    metadata?: Record<string, unknown>;
  }>,
): Promise<ApprovalRequestRef> {
  "use step";

  const approval = await createApprovalRequest({
    intentSummary: input.intentSummary,
    projectId: input.projectId,
    runId: input.runId,
    scope: input.scope,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });

  return { approvalId: approval.id, scope: approval.scope };
}
