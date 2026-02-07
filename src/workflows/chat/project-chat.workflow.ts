import { DurableAgent } from "@workflow/ai/agent";
import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { getAgentMode } from "@/lib/ai/agents/registry";
import { buildChatToolsForMode } from "@/lib/ai/tools/factory.server";
import { getWorkflowChatModel } from "@/workflows/ai/gateway-models.step";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";
import { persistChatMessagesForWorkflowRun } from "@/workflows/chat/steps/chat-messages.step";
import { touchChatThreadState } from "@/workflows/chat/steps/chat-thread-state.step";
import {
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";
import { createChatToolContext } from "@/workflows/chat/tool-context";
import { isWorkflowRunCancelledError } from "@/workflows/runs/workflow-errors";

/**
 * Durable multi-turn chat workflow for a single project.
 *
 * @param projectId - Project scope for retrieval and persistence.
 * @param initialMessages - Initial UI messages (must end with a user message).
 * @param threadTitle - Thread title used when lifecycle persistence needs to create the row.
 * @param modeId - Agent mode identifier (system prompt + tool allowlist).
 * @returns Final conversation messages.
 * @throws Error - Propagates workflow execution or finalization failures.
 */
export async function projectChat(
  projectId: string,
  initialMessages: UIMessage[],
  threadTitle: string,
  modeId: string,
): Promise<Readonly<{ messages: ModelMessage[] }>> {
  "use workflow";

  const { workflowRunId: runId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  let finishedStatus: "succeeded" | "failed" | "canceled" | null = null;
  let thrownError: unknown = null;
  const messages: ModelMessage[] = [];
  const mode = getAgentMode(modeId);
  const tools = buildChatToolsForMode(modeId);
  const threadStateInput = {
    mode: mode.modeId,
    projectId,
    title: threadTitle,
    workflowRunId: runId,
  } as const;

  try {
    messages.push(
      ...(await convertToModelMessages(initialMessages, {
        tools,
      })),
    );

    await touchChatThreadState({ ...threadStateInput, status: "running" });

    // Write markers for initial user messages so replay can reconstruct order.
    for (const msg of initialMessages) {
      if (msg.role !== "user") continue;
      const text = msg.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("");
      if (!text) continue;

      await writeUserMessageMarker(writable, {
        content: text,
        messageId: msg.id,
      });
    }

    const agent = new DurableAgent({
      model: () => getWorkflowChatModel(mode.defaultModel),
      system: mode.systemPrompt,
      tools,
    });

    const hook = chatMessageHook.create({ token: runId });
    let turnNumber = 0;

    while (true) {
      turnNumber += 1;

      await touchChatThreadState({ ...threadStateInput, status: "running" });

      const result = await agent.stream({
        activeTools: [...mode.allowedTools],
        collectUIMessages: true,
        experimental_context: createChatToolContext(projectId, modeId),
        maxSteps: mode.budgets.maxStepsPerTurn,
        messages,
        preventClose: true,
        sendFinish: false,
        sendStart: turnNumber === 1,
        writable,
      });
      messages.push(...result.messages.slice(messages.length));
      if (result.uiMessages) {
        await persistChatMessagesForWorkflowRun({
          messages: result.uiMessages,
          workflowRunId: runId,
        });
      }

      await touchChatThreadState({ ...threadStateInput, status: "waiting" });

      const { message: followUp, messageId } = await hook;
      if (followUp === "/done") break;

      await writeUserMessageMarker(writable, {
        content: followUp,
        messageId,
      });
      messages.push({ content: followUp, role: "user" });
    }

    finishedStatus = "succeeded";
  } catch (error) {
    finishedStatus = isWorkflowRunCancelledError(error) ? "canceled" : "failed";
    thrownError = error;
  } finally {
    const finalizationTasks: Promise<unknown>[] = [writeStreamClose(writable)];
    if (finishedStatus) {
      finalizationTasks.push(
        touchChatThreadState({
          ...threadStateInput,
          endedAt: new Date(),
          status: finishedStatus,
        }),
      );
    }

    const finalizationResults = await Promise.allSettled(finalizationTasks);
    const finalizationError = finalizationResults.find(
      (result) => result.status === "rejected",
    );
    if (!thrownError && finalizationError?.status === "rejected") {
      thrownError = finalizationError.reason;
    }
  }

  if (thrownError !== null && thrownError !== undefined) {
    throw thrownError;
  }

  return { messages };
}
