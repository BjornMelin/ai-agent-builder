import type { FileUIPart, UIMessageChunk } from "ai";
import {
  createChatFollowUpDisposition,
  createChatSessionStatus,
  createChatTerminalStatus,
  createChatUserMessageMarker,
} from "@/workflows/_shared/workflow-stream-events";

/**
 * Write the workflow-side admission outcome for a queued follow-up.
 *
 * @param writable - Workflow run output stream.
 * @param input - Stable message identity and admission outcome.
 */
export async function writeChatFollowUpDisposition(
  writable: WritableStream<UIMessageChunk>,
  input: Readonly<{
    messageId: string;
    outcome: "duplicate" | "rejected";
    reason:
      | "already_committed"
      | "not_waiting"
      | "payload_mismatch"
      | "stale_delivery";
  }>,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({
      data: createChatFollowUpDisposition({
        ...input,
        timestamp: Date.now(),
        type: "follow-up-disposition",
      }),
      type: "data-workflow",
    });
  } finally {
    writer.releaseLock();
  }
}

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
      data: createChatUserMessageMarker({
        content: input.content,
        ...(input.files && input.files.length > 0
          ? { files: [...input.files] }
          : {}),
        id: input.messageId,
        timestamp,
        type: "user-message",
      }),
      type: "data-workflow",
    };
    await writer.write(markerChunk);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Write the durable lifecycle state for a multi-turn chat session.
 *
 * @param writable - Workflow run output stream.
 * @param status - Whether the workflow is generating or awaiting a follow-up.
 */
export async function writeChatSessionStatus(
  writable: WritableStream<UIMessageChunk>,
  status: "running" | "waiting",
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({
      data: createChatSessionStatus({
        status,
        timestamp: Date.now(),
        type: "session-status",
      }),
      type: "data-workflow",
    });
  } finally {
    writer.releaseLock();
  }
}

/**
 * Emit the authoritative persisted terminal state and close the chat stream.
 *
 * @param writable - Workflow run output stream.
 * @param status - Authoritative terminal state read back from persistence.
 * @param errorText - Optional safe client-facing failure message.
 */
export async function writeChatTerminalAndClose(
  writable: WritableStream<UIMessageChunk>,
  status: "canceled" | "failed" | "succeeded",
  errorText?: string,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({
      data: createChatTerminalStatus({
        status,
        timestamp: Date.now(),
        type: "terminal",
      }),
      type: "data-workflow",
    });
    if (errorText) {
      await writer.write({ errorText, type: "error" });
    }
    await writer.write({ type: "finish" });
    await writer.close();
  } finally {
    writer.releaseLock();
  }
}

/**
 * Close a multi-turn stream explicitly.
 *
 * @param writable - Workflow run output stream.
 * @param errorText - Optional safe client-facing error written before finish.
 */
export async function writeStreamClose(
  writable: WritableStream<UIMessageChunk>,
  errorText?: string,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    if (errorText) {
      await writer.write({ errorText, type: "error" });
    }
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
