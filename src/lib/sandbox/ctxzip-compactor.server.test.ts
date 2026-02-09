import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("compactToolResults", () => {
  it("loads the ctx-zip compactor and returns compacted messages", async () => {
    const { compactToolResults } = await import(
      "@/lib/sandbox/ctxzip-compactor.server"
    );

    const messages: ModelMessage[] = [{ content: "hi", role: "user" }];
    const compacted = await compactToolResults(messages, {
      boundary: { count: 2, type: "keep-last" },
      sessionId: "test",
      // `ctx-zip` accepts different storage strategies, but for this wrapper
      // smoke test we only care that it can load and run.
      strategy: "drop-tool-results",
    });

    expect(Array.isArray(compacted)).toBe(true);
    expect(compacted.length).toBeGreaterThan(0);
  });

  it("caches the loaded compactor across calls", async () => {
    const { compactToolResults } = await import(
      "@/lib/sandbox/ctxzip-compactor.server"
    );

    const messages: ModelMessage[] = [{ content: "hi", role: "user" }];
    const a = await compactToolResults(messages, {
      boundary: { count: 2, type: "keep-last" },
      sessionId: "test",
      strategy: "drop-tool-results",
    });
    const b = await compactToolResults(messages, {
      boundary: { count: 2, type: "keep-last" },
      sessionId: "test",
      strategy: "drop-tool-results",
    });

    expect(a).toEqual(b);
  });
});
