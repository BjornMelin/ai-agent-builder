import "server-only";

import { FirecrawlClient, JobTimeoutError } from "@mendable/firecrawl-js";

import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { sha256Hex } from "@/lib/core/sha256";
import { env } from "@/lib/env";
import { assertSafeExternalHttpUrl } from "@/lib/security/url-safety.server";
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

function normalizeMaxChars(maxChars: number | undefined): number {
  if (maxChars === undefined) return budgets.maxWebExtractCharsPerUrl;
  return Math.min(Math.max(maxChars, 1), budgets.maxWebExtractCharsPerUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpstreamTimeoutError(error: unknown): boolean {
  if (error instanceof JobTimeoutError) return true;

  const name =
    error instanceof Error
      ? error.name
      : isRecord(error) && typeof error.name === "string"
        ? error.name
        : undefined;
  if (name === "TimeoutError") return true;

  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : undefined;
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") return true;

  return false;
}

/**
 * Extract a single URL using Firecrawl.
 *
 * @param input - Extraction input.
 * @returns Extracted markdown and metadata.
 * @throws AppError - With code `"bad_request"` when the URL is invalid or unsafe.
 * @throws AppError - With code `"aborted"` when the abort signal is already aborted
 * or becomes aborted during extraction.
 * @throws AppError - With code `"upstream_timeout"` when the upstream extraction
 * request times out.
 * @throws AppError - With code `"bad_gateway"` when the upstream extractor fails.
 * @throws AppError - With code `"bad_request"` when extraction succeeds but returns
 * an empty document.
 */
export async function extractWebPage(
  input: Readonly<{
    url: string;
    maxChars?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }>,
): Promise<WebExtractResult> {
  const url = assertSafeExternalHttpUrl(input.url);
  if (input.abortSignal?.aborted) {
    throw new AppError(
      "aborted",
      499,
      "Operation aborted.",
      input.abortSignal.reason,
    );
  }

  const redis = getRedisOptional();
  const key = cacheKey({ url: url.toString() });

  if (redis) {
    try {
      const cached = await redis.get<WebExtractResult>(key);
      if (cached) {
        const maxChars = normalizeMaxChars(input.maxChars);
        if (maxChars >= budgets.maxWebExtractCharsPerUrl) return cached;
        return {
          ...cached,
          markdown: truncateMarkdown(cached.markdown, maxChars),
        };
      }
    } catch (error) {
      log.debug("web_extract_cache_read_failed", { err: error });
      // Best-effort cache read; fall through to live request.
    }
  }

  const client = getFirecrawlClient();
  let doc: Awaited<ReturnType<typeof client.scrape>>;
  try {
    doc = await client.scrape(url.toString(), {
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: budgets.webExtractTimeoutMs,
    });
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw new AppError(
        "aborted",
        499,
        "Operation aborted.",
        input.abortSignal.reason,
      );
    }

    if (isUpstreamTimeoutError(error)) {
      throw new AppError(
        "upstream_timeout",
        504,
        "Web extraction timed out.",
        error,
      );
    }

    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    if (message.includes("timeout") || message.includes("timed out")) {
      throw new AppError(
        "upstream_timeout",
        504,
        "Web extraction timed out.",
        error,
      );
    }
    throw new AppError("bad_gateway", 502, "Web extraction failed.", error);
  }

  if (input.abortSignal?.aborted) {
    throw new AppError(
      "aborted",
      499,
      "Operation aborted.",
      input.abortSignal.reason,
    );
  }

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

  const maxChars = normalizeMaxChars(input.maxChars);
  if (maxChars >= budgets.maxWebExtractCharsPerUrl) return result;

  return { ...result, markdown: truncateMarkdown(result.markdown, maxChars) };
}
