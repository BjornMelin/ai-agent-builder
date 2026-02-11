import type { FileUIPart, UIMessageChunk } from "ai";

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
    files?: readonly FileUIPart[] | undefined;
    messageId: string;
  }>,
): Promise<void> {
  "use step";

  const timestamp = Date.now();
  const writer = writable.getWriter();
  try {
    const markerChunk: UIMessageChunk = {
      data: {
        content: input.content,
        ...(input.files && input.files.length > 0
          ? { files: input.files }
          : {}),
        id: input.messageId,
        timestamp,
        type: "user-message",
      },
      type: "data-workflow",
    };
    await writer.write(markerChunk);
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
    const finishChunk: UIMessageChunk = { type: "finish" };
    await writer.write(finishChunk);
    await writer.close();
  } finally {
    try {
      writer.releaseLock();
    } catch {
      // Ignore if lock was already released elsewhere.
    }
  }
}
