import "server-only";

import Exa from "exa-js";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/upstash/redis.server";

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

function cacheKey(
  input: Readonly<{ query: string; numResults: number }>,
): string {
  const payload = JSON.stringify({
    numResults: input.numResults,
    q: input.query.trim().toLowerCase(),
    v: 1,
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

  const redis = getRedisOptional();
  const key = cacheKey({ numResults, query });

  if (redis) {
    const cached = await redis.get<WebSearchResponse>(key);
    if (cached) return cached;
  }

  const exa = getExaClient();
  const response = await exa.search(query, {
    // Keep the search result payload small; deeper reads go through web.extract.
    contents: {
      highlights: { highlightsPerUrl: 3, numSentences: 2 },
      summary: true,
      text: { includeHtmlTags: false, maxCharacters: 1500 },
    },
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
