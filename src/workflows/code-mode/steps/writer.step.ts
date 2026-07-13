import type { UIMessageChunk } from "ai";

import {
  type CodeModeStreamEventInput,
  createCodeModeStreamEvent,
} from "@/workflows/_shared/workflow-stream-events";

/**
 * Write a Code Mode stream event to the workflow output stream.
 *
 * @param writable - Workflow run output stream.
 * @param event - Structured event payload.
 */
export async function writeCodeModeEvent(
  writable: WritableStream<UIMessageChunk>,
  event: CodeModeStreamEventInput,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    const chunk: UIMessageChunk = {
      data: createCodeModeStreamEvent(event),
      type: "data-workflow",
    };
    await writer.write(chunk);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Close a Code Mode stream explicitly.
 *
 * @param writable - Workflow run output stream.
 */
export async function closeCodeModeStream(
  writable: WritableStream<UIMessageChunk>,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    await writer.write({ type: "finish" });
    await writer.close();
  } finally {
    try {
      writer.releaseLock();
    } catch {
      // Ignore if lock was already released elsewhere.
    }
  }
}
