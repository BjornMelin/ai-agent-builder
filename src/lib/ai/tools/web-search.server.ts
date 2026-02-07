import "server-only";

import Exa from "exa-js";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/upstash/redis.server";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

let cachedExa: Exa | undefined;

function getExaClient(): Exa {
  cachedExa ??= new Exa(env.webResearch.exaApiKey);
  return cachedExa;
}

/**
 * Execute a web search via Exa.
 *
 * @param input - Search input.
 * @returns Search response.
 * @throws AppError - When query is empty or numResults is out of bounds.
 */
export async function searchWeb(
  input: Readonly<{
    query: string;
    numResults?: number | undefined;
    includeDomains?: readonly string[] | undefined;
    excludeDomains?: readonly string[] | undefined;
    startPublishedDate?: string | undefined;
    endPublishedDate?: string | undefined;
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
    const cached = await redis.get<WebSearchResponse>(key);
    if (cached) return cached;
  }

  const exa = getExaClient();
  const response = await exa.search(query, {
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
    type: "auto",
    userLocation: "US",
  });

  const result: WebSearchResponse = {
    requestId: response.requestId,
    results: response.results.map((r) => ({
      id: r.id,
      title: r.title,
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
