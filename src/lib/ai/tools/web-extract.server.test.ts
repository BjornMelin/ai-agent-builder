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
  firecrawlCtor: vi.fn(),
  firecrawlScrape: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("@mendable/firecrawl-js", () => ({
  FirecrawlClient: class FirecrawlClientMock {
    scrape = state.firecrawlScrape;

    constructor(options?: unknown) {
      state.firecrawlCtor(options);
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
  return await import("@/lib/ai/tools/web-extract.server");
}

describe("extractWebPage", () => {
  it("rejects invalid URLs", async () => {
    const { extractWebPage } = await loadModule();

    await expect(extractWebPage({ url: "not-a-url" })).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("rejects URLs that are unsafe for outbound fetches (SSRF defense-in-depth)", async () => {
    const { extractWebPage } = await loadModule();

    const unsafeUrls = [
      "http://localhost",
      "https://127.0.0.1",
      "http://[::1]",
      "https://example.com:8080/path",
      "https://user:pass@example.com/",
      "http://service.internal/path",
    ];

    for (const url of unsafeUrls) {
      await expect(extractWebPage({ url })).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);
    }
  });

  it("returns cached results without invoking Firecrawl", async () => {
    const cached = {
      description: null,
      extractedAt: new Date().toISOString(),
      markdown: "# cached",
      publishedTime: null,
      title: "Cached",
      url: "https://example.com",
    } as const;
    const redis = {
      get: vi.fn().mockResolvedValue(cached),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({ url: "https://example.com" });

    expect(result).toEqual(cached);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(state.firecrawlCtor).not.toHaveBeenCalled();
  });

  it("invokes Firecrawl on cache miss and caches the response", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "# Doc\n\nHello world",
      metadata: {
        description: "desc",
        publishedTime: "2026-02-07",
        title: "Doc",
      },
    });

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({
      maxChars: 10,
      url: "https://example.com/doc",
    });

    expect(state.firecrawlScrape).toHaveBeenCalledWith(
      "https://example.com/doc",
      expect.objectContaining({
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: budgets.webExtractTimeoutMs,
      }),
    );

    expect(redis.setex).toHaveBeenCalledWith(
      expect.stringMatching(/^cache:web-extract:/),
      budgets.webExtractCacheTtlSeconds,
      expect.objectContaining({
        extractedAt: expect.any(String),
        markdown: expect.any(String),
        url: "https://example.com/doc",
      }),
    );

    expect(result.url).toBe("https://example.com/doc");
    expect(result.markdown.length).toBeLessThanOrEqual(
      10 + "\n\n… [truncated]".length,
    );
  });

  it("clamps maxChars to the configured budget", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "x".repeat(budgets.maxWebExtractCharsPerUrl + 10),
      metadata: {},
    });

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({
      maxChars: budgets.maxWebExtractCharsPerUrl + 999,
      url: "https://example.com/long",
    });

    // Returns at most budget + truncation marker.
    expect(result.markdown.length).toBeLessThanOrEqual(
      budgets.maxWebExtractCharsPerUrl + "\n\n… [truncated]".length,
    );
  });
});
