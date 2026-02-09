import { withEnv } from "@tests/utils/env";
import { describe, expect, it, vi } from "vitest";

const embeddingsState = vi.hoisted(() => ({
  embeddingLength: 4,
}));

vi.mock("@/lib/ai/embeddings.server", () => ({
  embedText: vi.fn(async () =>
    Array.from({ length: embeddingsState.embeddingLength }, () => 0),
  ),
}));

async function loadUpstashProvider() {
  vi.resetModules();
  return await import("@/lib/providers/upstash.server");
}

function jsonResponse(
  value: unknown,
  init?: Readonly<{ status?: number }>,
): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status: init?.status ?? 200,
  });
}

describe("upstash provider", () => {
  it("returns manual fallback when Upstash Developer API is not configured", async () => {
    await withEnv(
      { UPSTASH_API_KEY: undefined, UPSTASH_EMAIL: undefined },
      async () => {
        const mod = await loadUpstashProvider();
        const res = await mod.ensureUpstashProvisioning({
          projectSlug: "demo",
          runId: "run_123",
        });
        expect(res.kind).toBe("manual");
        expect(res.provider).toBe("upstash");
      },
    );
  });

  it("provisions redis + vector via Developer API and does not leak tokens", async () => {
    const fetchMock = vi.fn(
      async (input: unknown, init?: Readonly<{ method?: string }>) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : typeof Request !== "undefined" && input instanceof Request
                ? input.url
                : String(input);
        const method = String(init?.method ?? "GET").toUpperCase();

        if (url === "https://api.upstash.com/v2/redis/databases") {
          return jsonResponse([]);
        }
        if (url === "https://api.upstash.com/v2/vector/index") {
          if (method === "GET") {
            return jsonResponse([]);
          }
          if (method === "POST") {
            return jsonResponse({
              dimension_count: embeddingsState.embeddingLength,
              endpoint: "glowing-baboon-15797-us1",
              id: "vector_1",
              name: "upstash-vector-demo-def456",
              read_only_token: "VECTOR_RO_TOKEN_SECRET",
              region: "us-east-1",
              similarity_function: "COSINE",
              token: "VECTOR_TOKEN_SECRET",
            });
          }
          throw new Error(`Unexpected method for ${url}: ${method}`);
        }
        if (url === "https://api.upstash.com/v2/redis/database") {
          return jsonResponse({
            database_id: "redis_1",
            database_name: "upstash-redis-demo-abc123",
            endpoint: "us1-merry-cat-32748",
            primary_region: "us-east-1",
          });
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      },
    );

    const prevFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await withEnv(
        {
          // AI Gateway (not used due to mocked embedText, but required by env contract elsewhere)
          AI_GATEWAY_API_KEY: "ai_gateway_test_key",
          AI_GATEWAY_BASE_URL: "https://ai-gateway.vercel.sh/v3/ai",
          UPSTASH_API_KEY: "upstash_test_key",
          // Upstash Developer API
          UPSTASH_EMAIL: "dev@example.com",
        },
        async () => {
          const mod = await loadUpstashProvider();
          const res = await mod.ensureUpstashProvisioning({
            projectSlug: "demo",
            runId: "run_123",
          });

          expect(res.kind).toBe("automated");
          expect(res.provider).toBe("upstash");

          // Our contract: no secret tokens in returned JSON.
          const serialized = JSON.stringify(res);
          expect(serialized).not.toContain("VECTOR_TOKEN_SECRET");
          expect(serialized).not.toContain("VECTOR_RO_TOKEN_SECRET");

          if (res.kind === "automated") {
            expect(res.vector.dimensionCount).toBe(
              embeddingsState.embeddingLength,
            );
            expect(res.redis.databaseId).toBe("redis_1");
            expect(res.vector.indexId).toBe("vector_1");
          }
        },
      );
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
