/**
 * Chat thread lifecycle status.
 */
export type ChatThreadStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";

/**
 * Resolve the next client-visible status when a chat stream closes.
 *
 * @param status - Current status before stream close.
 * @returns Preserved terminal status for failed/canceled/null states, otherwise `"succeeded"`.
 */
export function resolveRunStatusAfterChatEnd(
  status: ChatThreadStatus | null,
): ChatThreadStatus | null {
  if (status === null || status === "failed" || status === "canceled") {
    return status;
  }

  return "succeeded";
}
