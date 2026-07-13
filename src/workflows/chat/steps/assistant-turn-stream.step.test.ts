import { createWritableCollector } from "@tests/utils/streams";
import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workflowMocks = vi.hoisted(() => ({ getWritable: vi.fn() }));

vi.mock("workflow", () => ({ getWritable: workflowMocks.getWritable }));

import {
  buildAssistantTurnMessageStep,
  collectBufferedToolResults,
  publishAssistantTurnStep,
} from "./assistant-turn-stream.step";

let clientChunks: UIMessageChunk[];

beforeEach(() => {
  vi.clearAllMocks();
  const client = createWritableCollector<UIMessageChunk>();
  clientChunks = client.writes;
  workflowMocks.getWritable.mockReturnValue(client.writable);
});

describe("buildAssistantTurnMessageStep", () => {
  it("builds one canonical assistant message from completed durable steps", async () => {
    const message = await buildAssistantTurnMessageStep({
      assistantMessageId: "assistant:run-1:1",
      steps: [
        {
          reasoningText: "checking",
          text: "",
          toolCalls: [
            {
              input: { query: "durability" },
              toolCallId: "call-1",
              toolName: "searchWeb",
            },
          ],
        },
        { text: "Canonical answer", toolCalls: [] },
      ],
      toolResults: [
        {
          output: { type: "json", value: { results: ["source"] } },
          toolCallId: "call-1",
        },
      ],
    });

    expect(message).toEqual({
      id: "assistant:run-1:1",
      parts: [
        { type: "step-start" },
        { state: "done", text: "checking", type: "reasoning" },
        {
          input: { query: "durability" },
          output: { results: ["source"] },
          state: "output-available",
          toolCallId: "call-1",
          type: "tool-searchWeb",
        },
        { type: "step-start" },
        { state: "done", text: "Canonical answer", type: "text" },
      ],
      role: "assistant",
    });
  });

  it("rejects an empty producer result instead of publishing a phantom turn", async () => {
    await expect(
      buildAssistantTurnMessageStep({
        assistantMessageId: "assistant:run-1:1",
        steps: [],
        toolResults: [],
      }),
    ).rejects.toThrow("without an assistant message");
  });
});

describe("publishAssistantTurnStep", () => {
  it("publishes only a completed canonical message with deterministic identities", async () => {
    const message = await buildAssistantTurnMessageStep({
      assistantMessageId: "assistant:run-1:1",
      steps: [{ text: "Hello", toolCalls: [] }],
      toolResults: [],
    });

    await publishAssistantTurnStep({ includeStart: true, message });

    expect(clientChunks).toEqual(
      [
        { messageId: "assistant:run-1:1", type: "start" },
        { type: "start-step" },
        {
          id: "assistant:run-1:1:text:1",
          type: "text-start",
        },
        {
          delta: "Hello",
          id: "assistant:run-1:1:text:1",
          type: "text-delta",
        },
        { id: "assistant:run-1:1:text:1", type: "text-end" },
        { type: "finish-step" },
      ].map((chunk, sequence) => ({
        data: {
          assistantMessageId: "assistant:run-1:1",
          chunk,
          domain: "chat",
          sequence,
          type: "assistant-stream-chunk",
          version: 2,
        },
        type: "data-workflow",
      })),
    );
  });

  it("re-emits the exact sequence after a post-write step retry", async () => {
    const message = await buildAssistantTurnMessageStep({
      assistantMessageId: "assistant:run-1:1",
      steps: [{ text: "Committed once", toolCalls: [] }],
      toolResults: [],
    });

    await publishAssistantTurnStep({ includeStart: true, message });
    const firstAttempt = structuredClone(clientChunks);
    await publishAssistantTurnStep({ includeStart: true, message });

    expect(clientChunks).toEqual([...firstAttempt, ...firstAttempt]);
  });
});

describe("collectBufferedToolResults", () => {
  it("collects only tool results produced during the current model turn", () => {
    expect(
      collectBufferedToolResults([
        { content: "answer", role: "assistant" },
        {
          content: [
            {
              output: { type: "text", value: "ok" },
              toolCallId: "call-1",
              toolName: "lookup",
              type: "tool-result",
            },
          ],
          role: "tool",
        },
      ]),
    ).toEqual([
      {
        output: { type: "text", value: "ok" },
        toolCallId: "call-1",
      },
    ]);
  });
});
