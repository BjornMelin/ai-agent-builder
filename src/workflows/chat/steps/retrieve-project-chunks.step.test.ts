import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  retrieveProjectChunks: vi.fn(),
}));

vi.mock("@/lib/ai/tools/retrieval.server", () => ({
  retrieveProjectChunks: state.retrieveProjectChunks,
}));

function makeOptions(ctx: unknown): ToolExecutionOptions {
  return {
    experimental_context: ctx,
    messages: [],
    toolCallId: "test",
  } as unknown as ToolExecutionOptions;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.retrieveProjectChunks.mockResolvedValue([]);
});

describe("retrieveProjectChunksStep", () => {
  it("rejects when project context is missing", async () => {
    const { retrieveProjectChunksStep } = await import(
      "@/workflows/chat/steps/retrieve-project-chunks.step"
    );

    await expect(
      retrieveProjectChunksStep({ query: "x" }, makeOptions(undefined)),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);

    expect(state.retrieveProjectChunks).not.toHaveBeenCalled();
  });

  it("calls retrieveProjectChunks using projectId from experimental_context", async () => {
    const { retrieveProjectChunksStep } = await import(
      "@/workflows/chat/steps/retrieve-project-chunks.step"
    );

    await retrieveProjectChunksStep(
      { query: "hello", topK: 3 },
      makeOptions({ projectId: "proj_123" }),
    );

    expect(state.retrieveProjectChunks).toHaveBeenCalledWith({
      projectId: "proj_123",
      q: "hello",
      topK: 3,
    });
  });
});
