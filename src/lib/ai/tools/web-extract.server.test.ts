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
  logDebug: vi.fn(),
}));

vi.mock("@mendable/firecrawl-js", () => ({
  FirecrawlClient: class FirecrawlClientMock {
    scrape = state.firecrawlScrape;

    constructor(options?: unknown) {
      state.firecrawlCtor(options);
    }
  },
  JobTimeoutError: class JobTimeoutError extends Error {},
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/core/log", () => ({
  log: {
    debug: (...args: unknown[]) => state.logDebug(...args),
  },
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

  it("supports abort signals (already aborted)", async () => {
    const { extractWebPage } = await loadModule();

    const controller = new AbortController();
    controller.abort("nope");

    await expect(
      extractWebPage({
        abortSignal: controller.signal,
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({
      code: "aborted",
      status: 499,
    } satisfies Partial<AppError>);
  });

  it("treats Redis as optional (missing/throws) and still performs a live scrape", async () => {
    state.getRedis.mockImplementation(() => {
      throw new Error("redis unavailable");
    });

    state.firecrawlScrape.mockResolvedValue({
      markdown: "# Live\n\nok",
      metadata: { title: "Live" },
    });

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({ url: "https://example.com/live" });

    expect(result.title).toBe("Live");
    expect(state.firecrawlScrape).toHaveBeenCalledTimes(1);
  });

  it("logs and falls back when Redis cache reads fail", async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error("boom")),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "# Live\n\nok",
      metadata: {},
    });

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({ url: "https://example.com/live" });

    expect(result.markdown).toContain("Live");
    expect(state.logDebug).toHaveBeenCalledWith(
      "web_extract_cache_read_failed",
      {
        err: expect.any(Error),
      },
    );
  });

  it("returns cached results truncated when maxChars is below the storage budget", async () => {
    const cached = {
      description: null,
      extractedAt: new Date().toISOString(),
      markdown: "x".repeat(100),
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
    const result = await extractWebPage({
      maxChars: 10,
      url: "https://example.com",
    });

    expect(result.markdown).toMatch(/\[truncated\]$/);
    expect(result.markdown.length).toBeLessThanOrEqual(
      10 + "\n\n… [truncated]".length,
    );
    expect(state.firecrawlCtor).not.toHaveBeenCalled();
  });

  it("clamps maxChars to at least 1", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "hello world",
      metadata: {},
    });

    const { extractWebPage } = await loadModule();
    const result = await extractWebPage({
      maxChars: 0,
      url: "https://example.com/clamp",
    });

    expect(result.markdown).toMatch(/^h/);
    expect(result.markdown.length).toBeLessThanOrEqual(
      1 + "\n\n… [truncated]".length,
    );
  });

  it("returns bad_request when Firecrawl returns an empty document", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "   \n",
      metadata: {},
    });

    const { extractWebPage } = await loadModule();
    await expect(
      extractWebPage({ url: "https://example.com/empty" }),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("maps upstream timeout errors to upstream_timeout", async () => {
    const { JobTimeoutError } = await import("@mendable/firecrawl-js");

    const cases: Array<Readonly<{ label: string; error: unknown }>> = [
      {
        error: new JobTimeoutError("job_1", 1, "batch"),
        label: "JobTimeoutError",
      },
      (() => {
        const err = new Error("timeout");
        err.name = "TimeoutError";
        return { error: err, label: "TimeoutError name" } as const;
      })(),
      { error: { code: "ETIMEDOUT" }, label: "ETIMEDOUT code" },
      { error: { code: "ECONNABORTED" }, label: "ECONNABORTED code" },
      {
        error: new Error("Request timed out"),
        label: "message includes timed out",
      },
      {
        error: new Error("network timeout"),
        label: "message includes timeout",
      },
    ];

    for (const testCase of cases) {
      const redis = {
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue("OK"),
      };
      state.getRedis.mockReturnValue(redis);
      state.firecrawlScrape.mockRejectedValueOnce(testCase.error);

      const { extractWebPage } = await loadModule();
      await expect(
        extractWebPage({ url: "https://example.com/timeout" }),
      ).rejects.toMatchObject({
        code: "upstream_timeout",
        status: 504,
      } satisfies Partial<AppError>);
    }
  });

  it("maps non-timeout Firecrawl errors to bad_gateway", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);
    state.firecrawlScrape.mockRejectedValue(new Error("nope"));

    const { extractWebPage } = await loadModule();
    await expect(
      extractWebPage({ url: "https://example.com/fail" }),
    ).rejects.toMatchObject({
      code: "bad_gateway",
      status: 502,
    } satisfies Partial<AppError>);
  });

  it("treats Redis cache writes as best-effort", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockRejectedValue(new Error("write failed")),
    };
    state.getRedis.mockReturnValue(redis);

    state.firecrawlScrape.mockResolvedValue({
      markdown: "# Doc\n\nok",
      metadata: {},
    });

    const { extractWebPage } = await loadModule();
    await expect(
      extractWebPage({ url: "https://example.com/doc" }),
    ).resolves.toMatchObject({
      url: "https://example.com/doc",
    });
  });

  it("returns aborted when the abort signal is triggered during extraction", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const controller = new AbortController();

    state.firecrawlScrape.mockImplementation(async () => {
      controller.abort("stop");
      throw new Error("boom");
    });

    const { extractWebPage } = await loadModule();
    await expect(
      extractWebPage({
        abortSignal: controller.signal,
        url: "https://example.com/aborted",
      }),
    ).rejects.toMatchObject({
      code: "aborted",
      status: 499,
    } satisfies Partial<AppError>);
  });

  it("returns aborted when the abort signal is triggered after extraction but before parsing", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };
    state.getRedis.mockReturnValue(redis);

    const controller = new AbortController();

    state.firecrawlScrape.mockImplementation(async () => {
      controller.abort("stop");
      return { markdown: "# Doc", metadata: {} };
    });

    const { extractWebPage } = await loadModule();
    await expect(
      extractWebPage({
        abortSignal: controller.signal,
        url: "https://example.com/aborted2",
      }),
    ).rejects.toMatchObject({
      code: "aborted",
      status: 499,
    } satisfies Partial<AppError>);
  });
});
