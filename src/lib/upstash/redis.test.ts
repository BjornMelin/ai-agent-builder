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

async function withEnv<T>(
  overrides: Readonly<Record<string, string | undefined>>,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

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
        const { getRedis } = await import("@/lib/upstash/redis");
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

        const { getRedis } = await import("@/lib/upstash/redis");
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
