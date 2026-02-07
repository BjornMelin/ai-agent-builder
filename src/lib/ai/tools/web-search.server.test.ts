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
  exaCtor: vi.fn(),
  exaSearch: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("exa-js", () => ({
  default: class ExaMock {
    search = state.exaSearch;

    constructor(apiKey: string) {
      state.exaCtor(apiKey);
    }
  },
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
    expect(state.exaCtor).not.toHaveBeenCalled();
  });

  it("invokes Exa on cache miss and caches the normalized response", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.exaSearch.mockResolvedValue({
      requestId: "req_1",
      results: [
        {
          id: "hit_1",
          title: "A",
          url: "https://example.com/a",
        },
      ],
    });

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

    expect(state.exaSearch).toHaveBeenCalledWith(
      "Next.js cache components",
      expect.objectContaining({
        endPublishedDate: "2026-02-07",
        includeDomains: ["example.com"],
        numResults: budgets.maxWebSearchResults,
        startPublishedDate: "2026-01-01",
        type: "auto",
        userLocation: "US",
      }),
    );

    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^cache:web-search:/),
      budgets.webSearchCacheTtlSeconds,
      expect.objectContaining({
        requestId: "req_1",
      }),
    );
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
