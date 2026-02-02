import "server-only";

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

let cachedRedis: Redis | undefined;

/**
 * Lazily create and cache a single Upstash Redis client.
 *
 * This avoids `Redis.fromEnv()` (direct `process.env` access) and ensures env
 * validation happens at the first usage site.
 *
 * @returns Redis client.
 */
export function getRedis(): Redis {
  cachedRedis ??= new Redis({
    token: env.upstash.redisRestToken,
    url: env.upstash.redisRestUrl,
  });

  return cachedRedis;
}
