import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ctorShouldThrow: false,
  limit: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/core/log", () => ({
  log: {
    warn: state.warn,
  },
}));

vi.mock("@/lib/upstash/redis.server", () => ({
  getRedis: vi.fn(() => ({ mocked: true })),
}));

vi.mock("@upstash/ratelimit", () => {
  class MockRatelimit {
    static slidingWindow = vi.fn(() => ({ mocked: true }));

    constructor() {
      if (state.ctorShouldThrow) {
        throw new Error("missing_redis_config");
      }
    }

    limit = state.limit;
  }

  return { Ratelimit: MockRatelimit };
});

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/upstash/ratelimit.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.ctorShouldThrow = false;
  state.limit.mockResolvedValue({
    limit: 60,
    remaining: 59,
    reset: Date.now() + 60_000,
    success: true,
  });
});

describe("limitSearchRequest", () => {
  it("fails open when ratelimit backend throws during limit()", async () => {
    const { limitSearchRequest } = await loadModule();
    state.limit.mockRejectedValueOnce(new Error("upstash_unavailable"));

    const decision = await limitSearchRequest("search:user:ip");

    expect(decision.success).toBe(true);
    expect(decision.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(decision.remaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(decision.retryAfterSeconds).toBeNull();
    expect(state.warn).toHaveBeenCalledWith("search_ratelimit_unavailable", {
      err: expect.any(Error),
      identifier: "search:user:ip",
    });
  });

  it("fails open when ratelimit cannot be constructed", async () => {
    state.ctorShouldThrow = true;
    const { limitSearchRequest } = await loadModule();

    const decision = await limitSearchRequest("search:user:ip");

    expect(decision.success).toBe(true);
    expect(decision.limit).toBe(Number.MAX_SAFE_INTEGER);
    expect(decision.remaining).toBe(Number.MAX_SAFE_INTEGER);
    expect(decision.retryAfterSeconds).toBeNull();
    expect(state.limit).not.toHaveBeenCalled();
  });
});
