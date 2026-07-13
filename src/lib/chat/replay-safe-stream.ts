import type { UIMessageChunk } from "ai";

type AssistantStreamChunkMarker = Readonly<{
  assistantMessageId: string;
  chunk: UIMessageChunk;
  domain: "chat";
  sequence: number;
  type: "assistant-stream-chunk";
  version: 2;
}>;

function isAssistantStreamChunkMarker(
  value: unknown,
): value is AssistantStreamChunkMarker {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<AssistantStreamChunkMarker>;
  return (
    marker.domain === "chat" &&
    typeof marker.assistantMessageId === "string" &&
    Number.isSafeInteger(marker.sequence) &&
    (marker.sequence ?? -1) >= 0 &&
    marker.type === "assistant-stream-chunk" &&
    marker.version === 2 &&
    typeof marker.chunk === "object" &&
    marker.chunk !== null &&
    typeof marker.chunk.type === "string"
  );
}

/**
 * Decode replay-safe assistant envelopes and suppress retry duplicates.
 *
 * @remarks
 * Workflow streams are append-only while steps are at-least-once. The server
 * therefore publishes every assistant chunk with a deterministic turn/sequence
 * identity. A reconnect may encounter multiple copies, but this projection
 * exposes each semantic UI chunk once. Reusing an identity for different data
 * fails closed instead of silently corrupting the conversation.
 *
 * @param stream - Workflow UI stream containing assistant envelopes.
 * @param accepted - Payloads already accepted by this transport instance.
 * @returns A standard AI SDK UI message chunk stream.
 */
export function decodeReplaySafeAssistantStream(
  stream: ReadableStream<UIMessageChunk>,
  accepted: Map<string, string>,
): ReadableStream<UIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (
          chunk.type !== "data-workflow" ||
          !isAssistantStreamChunkMarker(chunk.data)
        ) {
          controller.enqueue(chunk);
          return;
        }

        const marker = chunk.data;
        const identity = `${marker.assistantMessageId}:${marker.sequence}`;
        const payload = JSON.stringify(marker.chunk);
        const previous = accepted.get(identity);
        if (previous !== undefined) {
          if (previous !== payload) {
            controller.error(
              new Error(
                `Assistant stream identity ${identity} was reused for different data.`,
              ),
            );
          }
          return;
        }

        accepted.set(identity, payload);
        controller.enqueue(marker.chunk);
      },
    }),
  );
}
