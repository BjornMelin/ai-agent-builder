import type { UIMessageChunk } from "ai";

/**
 * Write a `data-workflow` chunk to mark a user message in a multi-turn stream.
 *
 * @remarks
 * These markers let the client reconstruct the full conversation order when
 * replaying/resuming a stream after a refresh or disconnect.
 *
 * @param writable - Workflow run output stream.
 * @param input - Marker payload.
 */
export async function writeUserMessageMarker(
  writable: WritableStream<UIMessageChunk>,
  input: Readonly<{
    content: string;
    messageId: string;
  }>,
): Promise<void> {
  "use step";

  const timestamp = Date.now();
  const writer = writable.getWriter();
  try {
    await writer.write({
      data: {
        content: input.content,
        id: input.messageId,
        timestamp,
        type: "user-message",
      },
      type: "data-workflow",
    } as UIMessageChunk);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Close a multi-turn stream explicitly.
 *
 * @param writable - Workflow run output stream.
 */
export async function writeStreamClose(
  writable: WritableStream<UIMessageChunk>,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish" });
  } finally {
    writer.releaseLock();
  }

  await writable.close();
}
