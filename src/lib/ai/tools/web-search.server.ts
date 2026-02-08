import "server-only";

import { z } from "zod";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import {
  fetchWithTimeout,
  isFetchTimeoutError,
} from "@/lib/net/fetch-with-timeout.server";
import { getRedis } from "@/lib/upstash/redis.server";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXA_SEARCH_ENDPOINT = "https://api.exa.ai/search";

const exaSearchResultSchema = z.looseObject({
  author: z.string().nullish(),
  highlights: z.array(z.string()).nullish(),
  id: z.string().min(1),
  publishedDate: z.string().nullish(),
  score: z.number().nullish(),
  summary: z.string().nullish(),
  text: z.string().nullish(),
  title: z.string().nullish(),
  url: z.string().min(1),
});

const exaSearchResponseSchema = z.looseObject({
  requestId: z.string().min(1),
  results: z.array(exaSearchResultSchema).default([]),
});

/**
 * Minimal web search hit used by tool wrappers and research artifacts.
 */
export type WebSearchHit = Readonly<{
  id: string;
  url: string;
  title: string | null;
  publishedDate?: string;
  author?: string;
  score?: number;
  text?: string;
  summary?: string;
  highlights?: readonly string[];
}>;

/**
 * JSON-safe web search response metadata and results.
 */
export type WebSearchResponse = Readonly<{
  requestId: string;
  results: readonly WebSearchHit[];
}>;

function getRedisOptional() {
  try {
    return getRedis();
  } catch {
    return null;
  }
}

function normalizeDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid date format (expected YYYY-MM-DD).",
    );
  }
  return trimmed;
}

function normalizeDomains(
  value: readonly string[] | undefined,
): string[] | undefined {
  if (!value || value.length === 0) return undefined;
  const normalized = value
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  if (normalized.length === 0) return undefined;
  return Array.from(new Set(normalized)).slice(0, 20);
}

function cacheKey(
  input: Readonly<{
    query: string;
    numResults: number;
    includeDomains?: readonly string[] | undefined;
    excludeDomains?: readonly string[] | undefined;
    startPublishedDate?: string | undefined;
    endPublishedDate?: string | undefined;
  }>,
): string {
  const payload = JSON.stringify({
    endPublishedDate: input.endPublishedDate,
    excludeDomains: input.excludeDomains,
    includeDomains: input.includeDomains,
    numResults: input.numResults,
    q: input.query.trim().toLowerCase(),
    startPublishedDate: input.startPublishedDate,
    v: 2,
  });
  return `cache:web-search:${sha256Hex(payload)}`;
}

/**
 * Execute a web search via Exa.
 *
 * @remarks
 * numResults is clamped to the configured max and at least 1.
 *
 * @param input - Search input.
 * @returns Search response.
 * @throws AppError - When the query is empty or date formats are invalid.
 * @see docs/architecture/spec/SPEC-0007-web-research-citations-framework.md
 */
export async function searchWeb(
  input: Readonly<{
    query: string;
    numResults?: number | undefined;
    includeDomains?: readonly string[] | undefined;
    excludeDomains?: readonly string[] | undefined;
    startPublishedDate?: string | undefined;
    endPublishedDate?: string | undefined;
    abortSignal?: AbortSignal | undefined;
  }>,
): Promise<WebSearchResponse> {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new AppError("bad_request", 400, "Query must be non-empty.");
  }

  const numResultsRaw =
    input.numResults ?? Math.min(6, budgets.maxWebSearchResults);
  const numResults = Math.min(
    Math.max(numResultsRaw, 1),
    budgets.maxWebSearchResults,
  );

  const includeDomains = normalizeDomains(input.includeDomains);
  const excludeDomains = normalizeDomains(input.excludeDomains);
  const startPublishedDate = normalizeDate(input.startPublishedDate);
  const endPublishedDate = normalizeDate(input.endPublishedDate);

  const redis = getRedisOptional();
  const key = cacheKey({
    endPublishedDate,
    excludeDomains,
    includeDomains,
    numResults,
    query,
    startPublishedDate,
  });

  if (redis) {
    try {
      const cached = await redis.get<WebSearchResponse>(key);
      if (cached) return cached;
    } catch {
      // Best-effort cache read; fall through to live request.
    }
  }

  let responseJson: z.infer<typeof exaSearchResponseSchema>;
  try {
    const response = await fetchWithTimeout(
      EXA_SEARCH_ENDPOINT,
      {
        body: JSON.stringify({
          // Keep the search result payload small; deeper reads go through web.extract.
          contents: {
            highlights: { maxCharacters: 600, query },
            summary: true,
            text: { includeHtmlTags: false, maxCharacters: 1500 },
          },
          ...(includeDomains ? { includeDomains } : {}),
          ...(excludeDomains ? { excludeDomains } : {}),
          ...(startPublishedDate ? { startPublishedDate } : {}),
          ...(endPublishedDate ? { endPublishedDate } : {}),
          numResults,
          query,
          type: "auto",
          userLocation: "US",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.webResearch.exaApiKey,
        },
        method: "POST",
      },
      { signal: input.abortSignal, timeoutMs: budgets.webSearchTimeoutMs },
    );

    if (!response.ok) {
      throw new AppError(
        "bad_gateway",
        502,
        `Web search failed (${response.status}).`,
      );
    }

    const json = await response.json();
    const parsed = exaSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError(
        "bad_gateway",
        502,
        "Web search returned an unexpected response.",
        parsed.error,
      );
    }
    responseJson = parsed.data;
  } catch (error) {
    if (isFetchTimeoutError(error)) {
      throw new AppError("upstream_timeout", 504, "Web search timed out.");
    }
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("bad_gateway", 502, "Web search failed.", error);
  }

  const result: WebSearchResponse = {
    requestId: responseJson.requestId,
    results: responseJson.results.map((r) => ({
      id: r.id,
      title: typeof r.title === "string" ? r.title : null,
      url: r.url,
      ...(typeof r.publishedDate === "string" && r.publishedDate.length > 0
        ? { publishedDate: r.publishedDate }
        : {}),
      ...(typeof r.author === "string" && r.author.length > 0
        ? { author: r.author }
        : {}),
      ...(typeof r.score === "number" ? { score: r.score } : {}),
      ...(typeof r.text === "string" ? { text: r.text } : {}),
      ...(typeof r.summary === "string" ? { summary: r.summary } : {}),
      ...(Array.isArray(r.highlights) && r.highlights.length > 0
        ? { highlights: r.highlights }
        : {}),
    })),
  };

  if (redis) {
    await redis
      .setex(key, budgets.webSearchCacheTtlSeconds, result)
      .catch(() => {
        // Best-effort cache write.
      });
  }

  return result;
}
