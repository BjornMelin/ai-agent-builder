import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import { decodeReplaySafeAssistantStream } from "./replay-safe-stream";

function envelope(sequence: number, chunk: UIMessageChunk): UIMessageChunk {
  return {
    data: {
      assistantMessageId: "assistant:run-1:1",
      chunk,
      domain: "chat",
      sequence,
      type: "assistant-stream-chunk",
      version: 2,
    },
    type: "data-workflow",
  };
}

function streamOf(chunks: readonly UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("decodeReplaySafeAssistantStream", () => {
  it("projects a retried collector attempt into each semantic chunk once", async () => {
    const semanticChunks = [
      { messageId: "assistant:run-1:1", type: "start" },
      { type: "start-step" },
      { id: "text-1", type: "text-start" },
      { delta: "Hello", id: "text-1", type: "text-delta" },
      { id: "text-1", type: "text-end" },
      { type: "finish-step" },
    ] satisfies UIMessageChunk[];
    const attempt = semanticChunks.map((chunk, sequence) =>
      envelope(sequence, chunk),
    );

    await expect(
      readAll(
        decodeReplaySafeAssistantStream(
          streamOf([...attempt, ...attempt]),
          new Map(),
        ),
      ),
    ).resolves.toEqual(semanticChunks);
  });

  it("keeps dedupe state across transport reconnections", async () => {
    const accepted = new Map<string, string>();
    const first = envelope(0, { type: "start-step" });
    const second = envelope(1, {
      id: "text-1",
      type: "text-start",
    });

    await expect(
      readAll(decodeReplaySafeAssistantStream(streamOf([first]), accepted)),
    ).resolves.toEqual([{ type: "start-step" }]);
    await expect(
      readAll(
        decodeReplaySafeAssistantStream(streamOf([first, second]), accepted),
      ),
    ).resolves.toEqual([{ id: "text-1", type: "text-start" }]);
  });

  it("rejects one identity carrying different retry data", async () => {
    const accepted = new Map<string, string>();
    await readAll(
      decodeReplaySafeAssistantStream(
        streamOf([envelope(0, { type: "start-step" })]),
        accepted,
      ),
    );

    await expect(
      readAll(
        decodeReplaySafeAssistantStream(
          streamOf([envelope(0, { type: "finish-step" })]),
          accepted,
        ),
      ),
    ).rejects.toThrow("reused for different data");
  });
});
