import { withEnv } from "@tests/utils/env";
import { describe, expect, it, vi } from "vitest";

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

  it("throws on first access when APP_BASE_URL is missing", async () => {
    await withEnv({ APP_BASE_URL: undefined }, async () => {
      const { env } = await loadEnv();
      expect(() => env.app).toThrowError(/APP_BASE_URL/i);
    });
  });

  it("parses APP_BASE_URL when required vars exist", async () => {
    const appBaseUrl = "https://example.com";
    await withEnv({ APP_BASE_URL: appBaseUrl }, async () => {
      const { env } = await loadEnv();
      expect(env.app.baseUrl).toBe(appBaseUrl);
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
        expect(env.aiGateway.baseUrl).toBe(
          "https://ai-gateway.vercel.sh/v3/ai",
        );
      },
    );
  });

  it("defaults AI Gateway model IDs when unset", async () => {
    await withEnv(
      {
        AI_GATEWAY_API_KEY: "test-key",
        AI_GATEWAY_CHAT_MODEL: undefined,
        AI_GATEWAY_EMBEDDING_MODEL: undefined,
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.aiGateway.chatModel).toBe("xai/grok-4.1-fast-reasoning");
        expect(env.aiGateway.embeddingModel).toBe("alibaba/qwen3-embedding-4b");
      },
    );
  });

  it("requires AUTH_ALLOWED_EMAILS when AUTH_ACCESS_MODE is restricted", async () => {
    await withEnv(
      {
        AUTH_ACCESS_MODE: "restricted",
        AUTH_ALLOWED_EMAILS: undefined,
        NEON_AUTH_BASE_URL: "https://example.neon.com/neondb/auth",
        NEON_AUTH_COOKIE_SECRET: "a".repeat(32),
      },
      async () => {
        const { env } = await loadEnv();
        expect(() => env.auth).toThrowError(/AUTH_ALLOWED_EMAILS/i);
      },
    );
  });

  it("does not require AUTH_ALLOWED_EMAILS when AUTH_ACCESS_MODE is open", async () => {
    await withEnv(
      {
        AUTH_ACCESS_MODE: "open",
        AUTH_ALLOWED_EMAILS: undefined,
        NEON_AUTH_BASE_URL: "https://example.neon.com/neondb/auth",
        NEON_AUTH_COOKIE_SECRET: "a".repeat(32),
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.auth.allowedEmails).toEqual([]);
      },
    );
  });

  it("defaults NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS when unset", async () => {
    await withEnv(
      { NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: undefined },
      async () => {
        const { env } = await loadEnv();
        expect(env.authUi.socialProviders).toEqual(["github", "vercel"]);
      },
    );
  });

  it("supports disabling social providers with an empty NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS", async () => {
    await withEnv({ NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: "   " }, async () => {
      const { env } = await loadEnv();
      expect(env.authUi.socialProviders).toEqual([]);
    });
  });

  it("parses NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS case-insensitively and ignores unknown values", async () => {
    await withEnv(
      { NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: "GitHub,unknown,vercel,github" },
      async () => {
        const { env } = await loadEnv();
        expect(env.authUi.socialProviders).toEqual(["github", "vercel"]);
      },
    );
  });

  it("trims secrets/tokens before validation and output", async () => {
    await withEnv(
      {
        AUTH_ACCESS_MODE: "restricted",
        AUTH_ALLOWED_EMAILS:
          "  Alice@Example.com, bob@example.com, alice@example.com  ",
        NEON_AUTH_BASE_URL: "  https://example.neon.com/neondb/auth  ",
        NEON_AUTH_COOKIE_SECRET: `  ${"a".repeat(32)}  `,
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.auth.baseUrl).toBe("https://example.neon.com/neondb/auth");
        expect(env.auth.cookieSecret).toBe("a".repeat(32));
        expect(env.auth.allowedEmails).toEqual([
          "alice@example.com",
          "bob@example.com",
        ]);
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

  it("treats GitHub integration as optional when token is missing", async () => {
    await withEnv({ GITHUB_TOKEN: undefined }, async () => {
      const { env } = await loadEnv();
      expect(env.github.token).toBeNull();
    });
  });

  it("parses GitHub env when token exists", async () => {
    await withEnv({ GITHUB_TOKEN: "ghp_test" }, async () => {
      const { env } = await loadEnv();
      expect(env.github.token).toBe("ghp_test");
    });
  });

  it("throws on first access when Vercel webhook secret is missing", async () => {
    await withEnv({ VERCEL_WEBHOOK_SECRET: undefined }, async () => {
      const { env } = await loadEnv();
      expect(() => env.vercelWebhooks).toThrowError(/VERCEL_WEBHOOK_SECRET/i);
    });
  });

  it("parses Vercel webhook env when required vars exist", async () => {
    await withEnv({ VERCEL_WEBHOOK_SECRET: "secret_test" }, async () => {
      const { env } = await loadEnv();
      expect(env.vercelWebhooks.secret).toBe("secret_test");
    });
  });

  it("parses Vercel API env when required vars exist", async () => {
    await withEnv(
      { VERCEL_TEAM_ID: "team_123", VERCEL_TOKEN: "vercel_test" },
      async () => {
        const { env } = await loadEnv();
        expect(env.vercelApi.token).toBe("vercel_test");
        expect(env.vercelApi.teamId).toBe("team_123");
      },
    );
  });

  it("parses Sandbox env with OIDC token (preferred)", async () => {
    await withEnv({ VERCEL_OIDC_TOKEN: "oidc_test" }, async () => {
      const { env } = await loadEnv();
      expect(env.sandbox.auth).toBe("oidc");
      if (env.sandbox.auth === "oidc") {
        expect(env.sandbox.oidcToken).toBe("oidc_test");
      }
    });
  });

  it("parses Sandbox env with access token + project id (fallback)", async () => {
    await withEnv(
      {
        VERCEL_PROJECT_ID: "prj_test",
        VERCEL_TEAM_ID: "team_test",
        VERCEL_TOKEN: "vercel_test",
      },
      async () => {
        const { env } = await loadEnv();
        expect(env.sandbox.auth).toBe("token");
        if (env.sandbox.auth === "token") {
          expect(env.sandbox.token).toBe("vercel_test");
          expect(env.sandbox.projectId).toBe("prj_test");
          expect(env.sandbox.teamId).toBe("team_test");
        }
      },
    );
  });

  it("throws on sandbox env when no auth vars exist", async () => {
    await withEnv(
      {
        VERCEL_OIDC_TOKEN: undefined,
        VERCEL_PROJECT_ID: undefined,
        VERCEL_TEAM_ID: undefined,
        VERCEL_TOKEN: undefined,
      },
      async () => {
        const { env } = await loadEnv();
        expect(() => env.sandbox).toThrowError(/VERCEL_(OIDC_TOKEN|TOKEN)/i);
      },
    );
  });

  it("throws on sandbox env when access token is missing project id", async () => {
    await withEnv(
      {
        VERCEL_OIDC_TOKEN: undefined,
        VERCEL_PROJECT_ID: undefined,
        VERCEL_TEAM_ID: undefined,
        VERCEL_TOKEN: "vercel_test",
      },
      async () => {
        const { env } = await loadEnv();
        expect(() => env.sandbox).toThrowError(/VERCEL_PROJECT_ID/i);
      },
    );
  });

  it("validates Upstash Developer API email", async () => {
    await withEnv(
      { UPSTASH_API_KEY: "k", UPSTASH_EMAIL: "not-an-email" },
      async () => {
        const { env } = await loadEnv();
        expect(() => env.upstashDeveloper).toThrowError(/UPSTASH_EMAIL/i);
      },
    );
  });
});
