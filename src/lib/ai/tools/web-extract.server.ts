import "server-only";

import { FirecrawlClient } from "@mendable/firecrawl-js";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import { getRedis } from "@/lib/upstash/redis.server";

/**
 * Extracted web page payload (markdown-first).
 */
export type WebExtractResult = Readonly<{
  url: string;
  title: string | null;
  description: string | null;
  publishedTime: string | null;
  extractedAt: string;
  markdown: string;
}>;

function getRedisOptional() {
  try {
    return getRedis();
  } catch {
    return null;
  }
}

function cacheKey(input: Readonly<{ url: string }>): string {
  const payload = JSON.stringify({
    url: input.url,
    v: 2,
  });
  return `cache:web-extract:${sha256Hex(payload)}`;
}

let cachedClient: FirecrawlClient | undefined;

function getFirecrawlClient(): FirecrawlClient {
  cachedClient ??= new FirecrawlClient({
    apiKey: env.webResearch.firecrawlApiKey,
  });
  return cachedClient;
}

function truncateMarkdown(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown;
  return `${markdown.slice(0, maxChars)}\n\n… [truncated]`;
}

/**
 * Extract a single URL using Firecrawl.
 *
 * @param input - Extraction input.
 * @returns Extracted markdown and metadata.
 * @throws AppError - When the URL is invalid or extraction fails.
 */
export async function extractWebPage(
  input: Readonly<{ url: string; maxChars?: number | undefined }>,
): Promise<WebExtractResult> {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    throw new AppError("bad_request", 400, "Invalid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("bad_request", 400, "Unsupported URL protocol.");
  }

  const redis = getRedisOptional();
  const key = cacheKey({ url: url.toString() });

  if (redis) {
    const cached = await redis.get<WebExtractResult>(key);
    if (cached) {
      const maxChars =
        input.maxChars === undefined
          ? budgets.maxWebExtractCharsPerUrl
          : Math.min(
              Math.max(input.maxChars, 1),
              budgets.maxWebExtractCharsPerUrl,
            );
      if (maxChars >= budgets.maxWebExtractCharsPerUrl) return cached;
      return {
        ...cached,
        markdown: truncateMarkdown(cached.markdown, maxChars),
      };
    }
  }

  const client = getFirecrawlClient();
  const doc = await client.scrape(url.toString(), {
    formats: ["markdown"],
    onlyMainContent: true,
    timeout: 30_000,
  });

  const markdownRaw = doc.markdown ?? "";
  if (markdownRaw.trim().length === 0) {
    throw new AppError("bad_request", 400, "Failed to extract page content.");
  }

  const extractedAt = new Date().toISOString();
  const fullMarkdown = truncateMarkdown(
    markdownRaw,
    budgets.maxWebExtractCharsPerUrl,
  );
  const result: WebExtractResult = {
    description:
      typeof doc.metadata?.description === "string"
        ? doc.metadata.description
        : null,
    extractedAt,
    markdown: fullMarkdown,
    publishedTime:
      typeof doc.metadata?.publishedTime === "string"
        ? doc.metadata.publishedTime
        : null,
    title: typeof doc.metadata?.title === "string" ? doc.metadata.title : null,
    url: url.toString(),
  };

  if (redis) {
    await redis
      .setex(key, budgets.webExtractCacheTtlSeconds, result)
      .catch(() => {
        // Best-effort cache write.
      });
  }

  const maxChars =
    input.maxChars === undefined
      ? budgets.maxWebExtractCharsPerUrl
      : Math.min(Math.max(input.maxChars, 1), budgets.maxWebExtractCharsPerUrl);
  if (maxChars >= budgets.maxWebExtractCharsPerUrl) return result;

  return { ...result, markdown: truncateMarkdown(result.markdown, maxChars) };
}
