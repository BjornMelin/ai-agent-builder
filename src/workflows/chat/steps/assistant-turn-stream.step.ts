import {
  getToolName,
  isToolUIPart,
  type ModelMessage,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import { getWritable } from "workflow";

import { createChatAssistantStreamChunk } from "@/workflows/_shared/workflow-stream-events";

/** Serializable model step fields needed to construct one canonical UI turn. */
export type BufferedAssistantStep = Readonly<{
  reasoningText?: string | undefined;
  text: string;
  toolCalls: readonly Readonly<{
    dynamic?: boolean | undefined;
    input: unknown;
    providerExecuted?: boolean | undefined;
    toolCallId: string;
    toolName: string;
  }>[];
}>;

/** Serializable tool result retained from the WorkflowAgent conversation. */
export type BufferedToolResult = Readonly<{
  output: unknown;
  toolCallId: string;
}>;

type BufferedToolOutput =
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "output"; value: unknown }>;

function unwrapToolOutput(output: unknown): BufferedToolOutput {
  if (!output || typeof output !== "object" || !("type" in output)) {
    return { kind: "output", value: output };
  }

  const typed = output as {
    reason?: unknown;
    type?: unknown;
    value?: unknown;
  };
  if (typed.type === "execution-denied") return { kind: "denied" };
  if (
    typed.type === "content" ||
    typed.type === "error-json" ||
    typed.type === "error-text" ||
    typed.type === "json" ||
    typed.type === "text"
  ) {
    return { kind: "output", value: typed.value };
  }
  return { kind: "output", value: output };
}

/**
 * Construct the one durable assistant message for a fully completed agent turn.
 *
 * @remarks
 * WorkflowAgent model calls are intentionally run without a writable stream.
 * Their step result is durable before this builder runs, so a producer retry
 * can never append a second public answer. The returned message is persisted
 * before {@link publishAssistantTurnStep} exposes any of it.
 *
 * @param input - Completed model steps, tool results, and deterministic ID.
 * @returns The canonical assistant message to persist.
 */
export async function buildAssistantTurnMessageStep(
  input: Readonly<{
    assistantMessageId: string;
    steps: readonly BufferedAssistantStep[];
    toolResults: readonly BufferedToolResult[];
  }>,
): Promise<UIMessage> {
  "use step";

  const toolResults = new Map(
    input.toolResults.map((result) => [
      result.toolCallId,
      unwrapToolOutput(result.output),
    ]),
  );
  const parts: UIMessage["parts"] = [];

  for (const step of input.steps) {
    parts.push({ type: "step-start" });
    if (step.reasoningText) {
      parts.push({
        state: "done",
        text: step.reasoningText,
        type: "reasoning",
      });
    }
    if (step.text) {
      parts.push({ state: "done", text: step.text, type: "text" });
    }

    for (const call of step.toolCalls) {
      const result = toolResults.get(call.toolCallId);
      const common = {
        input: call.input,
        ...(call.providerExecuted === undefined
          ? {}
          : { providerExecuted: call.providerExecuted }),
        toolCallId: call.toolCallId,
      };
      const invocation = result
        ? result.kind === "denied"
          ? ({
              ...common,
              approval: { approved: false, id: call.toolCallId },
              state: "output-denied",
            } as const)
          : ({
              ...common,
              output: result.value,
              state: "output-available",
            } as const)
        : ({ ...common, state: "input-available" } as const);

      parts.push(
        (call.dynamic
          ? { ...invocation, toolName: call.toolName, type: "dynamic-tool" }
          : {
              ...invocation,
              type: `tool-${call.toolName}`,
            }) as UIMessage["parts"][number],
      );
    }
  }

  if (parts.length === 0) {
    throw new Error("Agent turn completed without an assistant message.");
  }
  return { id: input.assistantMessageId, parts, role: "assistant" };
}

function messageToChunks(
  message: UIMessage,
  includeStart: boolean,
): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = [];
  if (includeStart) {
    chunks.push({ messageId: message.id, type: "start" });
  }

  let hasOpenStep = false;
  for (const [index, part] of message.parts.entries()) {
    if (part.type === "step-start") {
      if (hasOpenStep) chunks.push({ type: "finish-step" });
      chunks.push({ type: "start-step" });
      hasOpenStep = true;
      continue;
    }

    if (part.type === "text" || part.type === "reasoning") {
      const id = `${message.id}:${part.type}:${index}`;
      chunks.push({ id, type: `${part.type}-start` });
      chunks.push({ delta: part.text, id, type: `${part.type}-delta` });
      chunks.push({ id, type: `${part.type}-end` });
      continue;
    }

    if (isToolUIPart(part)) {
      const dynamic = part.type === "dynamic-tool";
      const toolName = getToolName(part);
      chunks.push({
        dynamic,
        input: part.input,
        ...(part.providerExecuted === undefined
          ? {}
          : { providerExecuted: part.providerExecuted }),
        toolCallId: part.toolCallId,
        toolName,
        type: "tool-input-available",
      });
      if (part.state === "output-available") {
        chunks.push({
          dynamic,
          output: part.output,
          toolCallId: part.toolCallId,
          type: "tool-output-available",
        });
      } else if (part.state === "output-error") {
        chunks.push({
          dynamic,
          errorText: part.errorText,
          toolCallId: part.toolCallId,
          type: "tool-output-error",
        });
      } else if (part.state === "output-denied") {
        chunks.push({
          toolCallId: part.toolCallId,
          type: "tool-output-denied",
        });
      }
      continue;
    }

    if (part.type === "file") {
      chunks.push({
        mediaType: part.mediaType,
        ...(part.providerMetadata === undefined
          ? {}
          : { providerMetadata: part.providerMetadata }),
        type: "file",
        url: part.url,
      });
      continue;
    }
    if (part.type === "source-url" || part.type === "source-document") {
      chunks.push(part);
      continue;
    }
    if (part.type === "custom") {
      chunks.push(part);
    }
  }

  if (hasOpenStep) chunks.push({ type: "finish-step" });
  return chunks;
}

/**
 * Publish a previously persisted assistant message to the durable public stream.
 *
 * @remarks
 * Chunk identities depend only on the deterministic assistant message. A step
 * retry writes the exact same sequence, which the client replay decoder drops.
 *
 * @param input - Persisted message and session-start inclusion flag.
 */
export async function publishAssistantTurnStep(
  input: Readonly<{ includeStart: boolean; message: UIMessage }>,
): Promise<void> {
  "use step";

  const writable = getWritable<UIMessageChunk>();
  const writer = writable.getWriter();
  try {
    for (const [sequence, chunk] of messageToChunks(
      input.message,
      input.includeStart,
    ).entries()) {
      await writer.write({
        data: createChatAssistantStreamChunk({
          assistantMessageId: input.message.id,
          chunk,
          sequence,
          type: "assistant-stream-chunk",
        }),
        type: "data-workflow",
      });
    }
  } finally {
    writer.releaseLock();
  }
}

/**
 * Extract serializable tool results added by one WorkflowAgent turn.
 *
 * @param messages - Model messages added during the completed turn.
 * @returns Tool result identities and provider-normalized outputs.
 */
export function collectBufferedToolResults(
  messages: readonly ModelMessage[],
): BufferedToolResult[] {
  return messages.flatMap((message) =>
    message.role === "tool"
      ? message.content.flatMap((part) =>
          part.type === "tool-result"
            ? [{ output: part.output, toolCallId: part.toolCallId }]
            : [],
        )
      : [],
  );
}
