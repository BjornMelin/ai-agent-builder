import { withEnv } from "@tests/utils/env";
import { describe, expect, it, vi } from "vitest";

type RedisInit = Readonly<{ token: string; url: string }>;

const redisInits: RedisInit[] = [];

vi.mock("@upstash/redis", () => {
  class RedisMock {
    public readonly init: RedisInit;

    public constructor(init: RedisInit) {
      this.init = init;
      redisInits.push(init);
    }
  }

  return { Redis: RedisMock };
});

describe("getRedis", () => {
  it("fails when Upstash env is missing", async () => {
    await withEnv(
      {
        UPSTASH_REDIS_REST_TOKEN: undefined,
        UPSTASH_REDIS_REST_URL: undefined,
        UPSTASH_VECTOR_REST_TOKEN: undefined,
        UPSTASH_VECTOR_REST_URL: undefined,
      },
      async () => {
        vi.resetModules();
        const { getRedis } = await import("@/lib/upstash/redis.server");
        expect(() => getRedis()).toThrowError(/UPSTASH_/i);
      },
    );
  });

  it("creates a single client and uses trimmed env", async () => {
    await withEnv(
      {
        UPSTASH_REDIS_REST_TOKEN: "  redis-token  ",
        UPSTASH_REDIS_REST_URL: "  https://redis.example.com  ",
        UPSTASH_VECTOR_REST_TOKEN: "  vector-token  ",
        UPSTASH_VECTOR_REST_URL: "  https://vector.example.com  ",
      },
      async () => {
        vi.resetModules();
        redisInits.length = 0;

        const { getRedis } = await import("@/lib/upstash/redis.server");
        const a = getRedis();
        const b = getRedis();

        expect(a).toBe(b);
        expect(redisInits).toEqual([
          { token: "redis-token", url: "https://redis.example.com" },
        ]);
      },
    );
  });
});
