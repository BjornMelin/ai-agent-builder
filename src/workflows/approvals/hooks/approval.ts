import { defineHook } from "workflow";
import { z } from "zod";

/**
 * Payload schema for resuming an approval gate.
 */
const approvalResumeSchema = z.object({
  approvalId: z.string().min(1),
  approvedAt: z.string().min(1).nullable(),
  approvedBy: z.string().min(1),
  scope: z.string().min(1).optional(),
});

export type ApprovalResumePayload = z.infer<typeof approvalResumeSchema>;

/**
 * Hook used to resume a workflow run after a user approves an action.
 */
export const approvalHook = defineHook({
  schema: approvalResumeSchema,
});

/**
 * Build a stable token used to resume an approval gate.
 *
 * @remarks
 * We use the approval row ID as the hook token. This keeps tokens stable and
 * makes it easy for `/api/approvals` to resume the correct gate without
 * recomputing scope mappings.
 *
 * @param approvalId - Approval request ID.
 * @returns Stable token string.
 */
export function approvalHookToken(approvalId: string): string {
  return approvalId;
}

/**
 * Resume an approval hook by token.
 *
 * @param token - Hook token.
 * @param payload - Resume payload.
 */
export async function resumeApprovalHook(
  token: string,
  payload: ApprovalResumePayload,
): Promise<void> {
  await approvalHook.resume(token, payload);
}
