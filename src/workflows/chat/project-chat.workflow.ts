import { DurableAgent } from "@workflow/ai/agent";
import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWorkflowMetadata, getWritable } from "workflow";

import { getWorkflowDefaultChatModel } from "@/workflows/ai/gateway-models.step";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";
import { PROJECT_CHAT_SYSTEM_PROMPT } from "@/workflows/chat/prompt";
import {
  writeStreamClose,
  writeUserMessageMarker,
} from "@/workflows/chat/steps/writer.step";
import { chatTools } from "@/workflows/chat/tools";

/**
 * Durable multi-turn chat workflow for a single project.
 *
 * @param projectId - Project scope for retrieval and persistence.
 * @param initialMessages - Initial UI messages (must end with a user message).
 * @returns Final conversation messages.
 */
export async function projectChat(
  projectId: string,
  initialMessages: UIMessage[],
): Promise<Readonly<{ messages: ModelMessage[] }>> {
  "use workflow";

  const { workflowRunId: runId } = getWorkflowMetadata();
  const writable = getWritable<UIMessageChunk>();
  const messages: ModelMessage[] = await convertToModelMessages(
    initialMessages,
    {
      tools: chatTools,
    },
  );

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
    model: getWorkflowDefaultChatModel,
    system: PROJECT_CHAT_SYSTEM_PROMPT,
    tools: chatTools,
  });

  const hook = chatMessageHook.create({ token: runId });
  let turnNumber = 0;

  try {
    while (true) {
      turnNumber += 1;

      const result = await agent.stream({
        experimental_context: { projectId },
        maxSteps: 12,
        messages,
        preventClose: true,
        sendFinish: false,
        sendStart: turnNumber === 1,
        writable,
      });
      messages.push(...result.messages.slice(messages.length));

      const { message: followUp } = await hook;
      if (followUp === "/done") break;

      const followUpId = `user-${runId}-${turnNumber}`;

      await writeUserMessageMarker(writable, {
        content: followUp,
        messageId: followUpId,
      });
      messages.push({ content: followUp, role: "user" });
    }
  } finally {
    await writeStreamClose(writable);
  }

  return { messages };
}
