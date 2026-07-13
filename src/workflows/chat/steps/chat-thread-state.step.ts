import type { ChatThreadStatus } from "@/lib/chat/thread-status";
import { claimChatWorkflow } from "@/lib/data/chat-start.server";
import {
  type ChatThreadTransitionResult,
  transitionChatThreadState,
} from "@/lib/data/chat-thread-state.server";

/**
 * Claim the route-persisted chat start intent before any workflow side effect.
 *
 * @remarks
 * This is a workflow step because DB writes must not occur in `"use workflow"`
 * orchestrator functions.
 *
 * @param threadId - Client-known canonical thread UUID.
 * @param workflowRunId - Native Workflow execution ID.
 * @returns Whether this Workflow owns the chat thread.
 */
export async function registerChatWorkflowStep(
  threadId: string,
  workflowRunId: string,
): Promise<boolean> {
  "use step";

  return await claimChatWorkflow(threadId, workflowRunId);
}

/**
 * Apply the canonical terminal-monotonic lifecycle transition as a workflow step.
 *
 * @param input - Workflow run and requested lifecycle state.
 * @returns Authoritative persisted state after compare-and-swap.
 */
export async function transitionChatThreadStateStep(
  input: Readonly<{
    endedAt?: Date | null;
    status: ChatThreadStatus;
    workflowRunId: string;
  }>,
): Promise<ChatThreadTransitionResult> {
  "use step";

  return await transitionChatThreadState(input);
}
