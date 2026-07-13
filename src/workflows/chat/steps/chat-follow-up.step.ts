import {
  acceptChatFollowUp,
  type ChatFollowUpAcceptance,
  type ChatFollowUpPayload,
} from "@/lib/data/chat-follow-up.server";

/**
 * Consume one durable chat hook delivery before any transcript or model side effect.
 *
 * @param input - Durable hook payload and waiting-generation fence.
 * @returns Whether the delivery was accepted, crash-resumed, or must be skipped.
 */
export async function acceptChatFollowUpStep(
  input: Readonly<{
    messageId: string;
    payload: ChatFollowUpPayload;
    waitingSince: string;
    workflowRunId: string;
  }>,
): Promise<ChatFollowUpAcceptance> {
  "use step";

  return await acceptChatFollowUp(input);
}
