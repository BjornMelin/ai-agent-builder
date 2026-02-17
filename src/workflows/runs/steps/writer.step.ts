import type { UIMessageChunk } from "ai";

import {
  createRunStreamEvent,
  type RunStreamEventInput,
} from "@/workflows/_shared/workflow-stream-events";

/**
 * Write a run stream event to the workflow output stream.
 *
 * @param writable - Workflow run output stream.
 * @param event - Structured run event payload.
 */
export async function writeRunEvent(
  writable: WritableStream<UIMessageChunk>,
  event: RunStreamEventInput,
): Promise<void> {
  "use step";

  const writer = writable.getWriter();
  try {
    const chunk: UIMessageChunk = {
      data: createRunStreamEvent(event),
      type: "data-workflow",
    };
    await writer.write(chunk);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Close a run stream explicitly.
 *
 * @param writable - Workflow run output stream.
 */
export async function closeRunStream(
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
