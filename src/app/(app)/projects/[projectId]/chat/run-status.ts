import type { ChatThreadStatus } from "@/lib/chat/thread-status";

/** Chat thread status values used by project chat client state transitions. */
export type { ChatThreadStatus } from "@/lib/chat/thread-status";

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
