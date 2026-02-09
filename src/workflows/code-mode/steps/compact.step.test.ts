import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  compactToolResults: vi.fn(),
  createCtxZipManagerForSandboxId: vi.fn(),
}));

vi.mock("@/lib/sandbox/ctxzip.server", () => ({
  createCtxZipManagerForSandboxId: (...args: unknown[]) =>
    state.createCtxZipManagerForSandboxId(...args),
}));

vi.mock("@/lib/sandbox/ctxzip-compactor.server", () => ({
  compactToolResults: (...args: unknown[]) => state.compactToolResults(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.createCtxZipManagerForSandboxId.mockResolvedValue({
    fileAdapter: { kind: "adapter" },
    manager: {
      getCompactDir: () => "/vercel/sandbox/.ctxzip/compact",
    },
  });

  state.compactToolResults.mockImplementation(
    async (messages: readonly ModelMessage[]) => Array.from(messages),
  );
});

describe("compactCodeModeMessagesStep", () => {
  it("compacts messages using ctx-zip storage and returns compact dir", async () => {
    const { compactCodeModeMessagesStep } = await import("./compact.step");

    const messages: ModelMessage[] = [{ content: "hi", role: "user" }];
    await expect(
      compactCodeModeMessagesStep({
        messages,
        sandboxId: "sb_1",
        sessionId: "code-mode:run_1",
      }),
    ).resolves.toEqual({
      compactDir: "/vercel/sandbox/.ctxzip/compact",
      compacted: messages,
    });

    expect(state.createCtxZipManagerForSandboxId).toHaveBeenCalledWith(
      "sb_1",
      "code-mode:run_1",
    );

    expect(state.compactToolResults).toHaveBeenCalledWith(messages, {
      boundary: { count: 8, type: "keep-last" },
      sessionId: "code-mode:run_1",
      storage: { kind: "adapter" },
      strategy: "write-tool-results-to-file",
    });
  });
});
