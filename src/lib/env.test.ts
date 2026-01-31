import { describe, expect, it, vi } from "vitest";

type EnvOverrides = Readonly<Record<string, string | undefined>>;

async function withEnv<T>(
  overrides: EnvOverrides,
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

async function loadEnv() {
  vi.resetModules();
  return await import("@/lib/env");
}

describe("env feature gates", () => {
  it("throws on first access when a required feature var is missing", async () => {
    await withEnv({ DATABASE_URL: undefined }, async () => {
      const { env } = await loadEnv();
      expect(() => env.db).toThrowError(/DATABASE_URL/i);
    });
  });

  it("parses a feature gate when required vars exist", async () => {
    const databaseUrl = "postgresql://user:pw@localhost/db";
    await withEnv({ DATABASE_URL: databaseUrl }, async () => {
      const { env } = await loadEnv();
      expect(env.db.databaseUrl).toBe(databaseUrl);
    });
  });

  it("defaults AI_GATEWAY_BASE_URL when unset", async () => {
    await withEnv(
      {
        AI_GATEWAY_API_KEY: "test-key",
        AI_GATEWAY_BASE_URL: undefined,
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.aiGateway.baseUrl).toBe("https://ai-gateway.vercel.sh/v1");
      },
    );
  });

  it("trims secrets/tokens before validation and output", async () => {
    const secret = "a".repeat(32);

    await withEnv(
      {
        ADMIN_PASSWORD_HASH: "  hash  ",
        APP_SESSION_SECRET: `  ${secret}  `,
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.auth.adminPasswordHash).toBe("hash");
        expect(env.auth.sessionSecret).toBe(secret);
      },
    );
  });

  it("caches parsed env values per feature gate", async () => {
    await withEnv({ DATABASE_URL: "postgresql://a/a" }, async () => {
      const { env } = await loadEnv();
      expect(env.db.databaseUrl).toBe("postgresql://a/a");

      process.env.DATABASE_URL = "postgresql://b/b";
      expect(env.db.databaseUrl).toBe("postgresql://a/a");
    });
  });
});
