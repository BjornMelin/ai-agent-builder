import { beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  env: {
    webResearch: {
      exaApiKey: "exa-test-key",
      firecrawlApiKey: "fc-test-key",
    },
  },
  fetch: vi.fn(),
  getRedis: vi.fn(),
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
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", state.fetch);
});

async function loadModule() {
  return await import("@/lib/ai/tools/web-search.server");
}

describe("searchWeb", () => {
  it("rejects empty queries", async () => {
    const { searchWeb } = await loadModule();

    await expect(searchWeb({ query: " " })).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("returns cached results without invoking Exa", async () => {
    const cached = { requestId: "req_cached", results: [] } as const;
    const redis = {
      get: vi.fn().mockResolvedValue(cached),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const { searchWeb } = await loadModule();
    const result = await searchWeb({ query: "Next.js" });

    expect(result).toEqual(cached);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("invokes Exa on cache miss and caches the normalized response", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          requestId: "req_1",
          results: [
            {
              id: "hit_1",
              title: "A",
              url: "https://example.com/a",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

    const { searchWeb } = await loadModule();
    const result = await searchWeb({
      endPublishedDate: "2026-02-07",
      includeDomains: ["Example.com", "example.com", ""],
      numResults: 999,
      query: "  Next.js cache components  ",
      startPublishedDate: "2026-01-01",
    });

    expect(result.requestId).toBe("req_1");
    expect(result.results).toHaveLength(1);

    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(state.fetch).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "exa-test-key",
        }),
        method: "POST",
      }),
    );

    const [, init] = state.fetch.mock.calls[0] ?? [];
    const body =
      init && typeof init === "object"
        ? (init as Record<string, unknown>).body
        : null;
    expect(typeof body).toBe("string");
    const payload = JSON.parse(body as string) as Record<string, unknown>;
    expect(payload.query).toBe("Next.js cache components");
    expect(payload).toMatchObject({
      endPublishedDate: "2026-02-07",
      includeDomains: ["example.com"],
      numResults: budgets.maxWebSearchResults,
      startPublishedDate: "2026-01-01",
      type: "auto",
      userLocation: "US",
    });

    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^cache:web-search:/),
      budgets.webSearchCacheTtlSeconds,
      expect.objectContaining({
        requestId: "req_1",
      }),
    );
  });

  it("times out when the upstream request exceeds the timeout budget", async () => {
    vi.useFakeTimers();
    try {
      state.fetch.mockImplementation(
        (_input: unknown, init?: { signal?: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            if (init?.signal) {
              const onAbort = () => reject(new Error("aborted"));
              if (init.signal.aborted) {
                onAbort();
                return;
              }
              init.signal.addEventListener("abort", onAbort, { once: true });
            }
          });
        },
      );

      const { searchWeb } = await loadModule();
      const promise = searchWeb({ query: "timeouts" });
      const expectation = expect(promise).rejects.toMatchObject({
        code: "upstream_timeout",
        status: 504,
      } satisfies Partial<AppError>);

      await vi.advanceTimersByTimeAsync(budgets.webSearchTimeoutMs);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid date strings", async () => {
    const { searchWeb } = await loadModule();

    await expect(
      searchWeb({
        query: "test",
        startPublishedDate: "20260207",
      }),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });
});
