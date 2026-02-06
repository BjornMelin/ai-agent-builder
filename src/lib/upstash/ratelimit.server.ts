import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import { log } from "@/lib/core/log";
import { getRedis } from "@/lib/upstash/redis.server";

const SEARCH_REQUESTS_PER_MINUTE = 60;

/**
 * Search rate-limit decision.
 */
export type SearchRateLimitDecision = Readonly<{
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number | null;
}>;

let cachedSearchRatelimit: Ratelimit | null | undefined;

function allowDecision(): SearchRateLimitDecision {
  return {
    limit: Number.MAX_SAFE_INTEGER,
    remaining: Number.MAX_SAFE_INTEGER,
    reset: Date.now(),
    retryAfterSeconds: null,
    success: true,
  };
}

function getSearchRatelimit(): Ratelimit | null {
  if (cachedSearchRatelimit !== undefined) {
    return cachedSearchRatelimit;
  }

  try {
    cachedSearchRatelimit = new Ratelimit({
      analytics: true,
      limiter: Ratelimit.slidingWindow(SEARCH_REQUESTS_PER_MINUTE, "1 m"),
      redis: getRedis(),
      timeout: 2_000,
    });
  } catch {
    // Local/test environments may intentionally omit Upstash credentials.
    cachedSearchRatelimit = null;
  }

  return cachedSearchRatelimit;
}

/**
 * Apply server-side rate limiting to a search identifier.
 *
 * @param identifier - Stable identifier (for example `search:userId:ip`).
 * @returns Rate-limit decision with retry metadata.
 */
export async function limitSearchRequest(
  identifier: string,
): Promise<SearchRateLimitDecision> {
  const ratelimit = getSearchRatelimit();
  if (!ratelimit) {
    return allowDecision();
  }

  try {
    const result = await ratelimit.limit(identifier);
    const retryAfterSeconds = result.success
      ? null
      : Math.max(Math.ceil((result.reset - Date.now()) / 1_000), 1);

    return {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfterSeconds,
      success: result.success,
    };
  } catch (error) {
    log.warn("search_ratelimit_unavailable", { err: error, identifier });
    return allowDecision();
  }
}
