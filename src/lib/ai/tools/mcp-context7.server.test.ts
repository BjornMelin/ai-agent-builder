import { beforeEach, describe, expect, it, vi } from "vitest";

import { budgets } from "@/lib/config/budgets.server";

const state = vi.hoisted(() => ({
  createMCPClient: vi.fn(),
  env: {
    context7: { apiKey: "context7-test-key" },
  },
  getRedis: vi.fn(),
}));

vi.mock("@ai-sdk/mcp", () => ({
  createMCPClient: state.createMCPClient,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/upstash/redis.server", () => ({
  getRedis: state.getRedis,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Context7 MCP wrapper", () => {
  it("returns cached results without invoking MCP", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue({ ok: true }),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const mod = await import("@/lib/ai/tools/mcp-context7.server");
    const result = await mod.context7ResolveLibraryId({
      libraryName: "react",
      query: "useState",
    });

    expect(result).toEqual({ ok: true });
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(state.createMCPClient).not.toHaveBeenCalled();
  });

  it("invokes MCP and caches the response on a cache miss", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const executeResolve = vi.fn().mockResolvedValue({ data: ["ok"] });
    const close = vi.fn().mockResolvedValue(undefined);

    state.createMCPClient.mockResolvedValue({
      close,
      tools: vi.fn().mockResolvedValue({
        "query-docs": { execute: vi.fn() },
        "resolve-library-id": { execute: executeResolve },
      }),
    });

    const mod = await import("@/lib/ai/tools/mcp-context7.server");
    const result = await mod.context7ResolveLibraryId({
      libraryName: "react",
      query: "useState",
    });

    expect(result).toEqual({ data: ["ok"] });
    expect(executeResolve).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^cache:context7:resolve-library-id:/),
      budgets.context7CacheTtlSeconds,
      { data: ["ok"] },
    );
  });

  it("rejects oversized responses (defense-in-depth)", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const executeResolve = vi.fn().mockResolvedValue({
      // Exceeds maxContext7ResponseBytes once JSON stringified.
      data: "x".repeat(budgets.maxContext7ResponseBytes + 10_000),
    });
    const close = vi.fn().mockResolvedValue(undefined);

    state.createMCPClient.mockResolvedValue({
      close,
      tools: vi.fn().mockResolvedValue({
        "resolve-library-id": { execute: executeResolve },
      }),
    });

    const mod = await import("@/lib/ai/tools/mcp-context7.server");
    await expect(
      mod.context7ResolveLibraryId({
        libraryName: "react",
        query: "useState",
      }),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("times out when the tool call exceeds the timeout budget", async () => {
    vi.useFakeTimers();

    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const executeResolve = vi
      .fn()
      .mockImplementation(
        async (_args: unknown, options?: { abortSignal?: AbortSignal }) => {
          return await new Promise((_, reject) => {
            const signal = options?.abortSignal;
            if (!signal) return;
            const onAbort = () => reject(new Error("aborted"));
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort, { once: true });
          });
        },
      );
    const close = vi.fn().mockResolvedValue(undefined);

    state.createMCPClient.mockResolvedValue({
      close,
      tools: vi.fn().mockResolvedValue({
        "resolve-library-id": { execute: executeResolve },
      }),
    });

    const mod = await import("@/lib/ai/tools/mcp-context7.server");
    const promise = mod.context7ResolveLibraryId({
      libraryName: "react",
      query: "useState",
    });
    const expectation = expect(promise).rejects.toMatchObject({
      code: "upstream_timeout",
      status: 504,
    });

    await vi.advanceTimersByTimeAsync(budgets.context7TimeoutMs);

    await expectation;
    expect(close).toHaveBeenCalledTimes(1);
    expect(redis.setex).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
