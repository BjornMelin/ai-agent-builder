import "server-only";

import { z } from "zod";
import { embedText } from "@/lib/ai/embeddings.server";
import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/net/fetch-with-timeout.server";
import {
  buildResourceNameHint,
  createManualFallbackArtifact,
  type ManualFallbackArtifact,
} from "@/lib/providers/manual-fallback.server";

/**
 * Upstash provisioning result used by Implementation Runs.
 */
export type UpstashProvisioningResult =
  | Readonly<{
      kind: "automated";
      provider: "upstash";
      redis: UpstashRedisProvisioningRef;
      vector: UpstashVectorProvisioningRef;
      /**
       * Manual steps required to configure secrets without persisting them.
       */
      artifact: ManualFallbackArtifact;
    }>
  | Readonly<{
      kind: "manual";
      provider: "upstash";
      artifact: ManualFallbackArtifact;
    }>;

/**
 * Non-secret Redis database metadata returned by provisioning.
 */
export type UpstashRedisProvisioningRef = Readonly<{
  databaseId: string;
  databaseName: string;
  created: boolean;
  /**
   * Hostname or slug returned by the Upstash API (non-secret).
   */
  endpoint: string | null;
  /**
   * Derived REST URL when possible (non-secret).
   */
  restUrl: string | null;
  primaryRegion: string | null;
}>;

/**
 * Non-secret Vector index metadata returned by provisioning.
 */
export type UpstashVectorProvisioningRef = Readonly<{
  indexId: string;
  indexName: string;
  created: boolean;
  /**
   * Hostname or slug returned by the Upstash API (non-secret).
   */
  endpoint: string | null;
  /**
   * Derived REST URL when possible (non-secret).
   */
  restUrl: string | null;
  region: string | null;
  dimensionCount: number;
  similarityFunction: string | null;
}>;

const UPSTASH_API_BASE_URL = "https://api.upstash.com/v2";

function isUpstashDeveloperConfigured(): boolean {
  const apiKey = process.env.UPSTASH_API_KEY;
  const email = process.env.UPSTASH_EMAIL;
  return (
    typeof apiKey === "string" &&
    apiKey.trim().length > 0 &&
    typeof email === "string" &&
    email.trim().length > 0
  );
}

function toUpstashApiUrl(
  path: string,
  query?: Readonly<Record<string, string>>,
): string {
  const url = new URL(`${UPSTASH_API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function buildBasicAuthHeader(
  input: Readonly<{ email: string; apiKey: string }>,
) {
  const token = Buffer.from(`${input.email}:${input.apiKey}`, "utf8").toString(
    "base64",
  );
  return `Basic ${token}`;
}

async function upstashApiJson(
  input: Readonly<{
    method: "GET" | "POST";
    path: string;
    query?: Readonly<Record<string, string>>;
    body?: unknown;
  }>,
): Promise<unknown> {
  const config = env.upstashDeveloper;
  const url = toUpstashApiUrl(input.path, input.query);

  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        Accept: "application/json",
        Authorization: buildBasicAuthHeader({
          apiKey: config.apiKey,
          email: config.email,
        }),
        ...(input.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      method: input.method,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    },
    { timeoutMs: 15_000 },
  );

  if (!res.ok) {
    const status = res.status;
    if (status === 401 || status === 403) {
      throw new AppError(
        "provider_auth_failed",
        502,
        `Upstash API request failed (${status}). Check UPSTASH_EMAIL/UPSTASH_API_KEY permissions.`,
      );
    }
    throw new AppError(
      "provider_error",
      502,
      `Upstash API request failed (${status}).`,
    );
  }

  return (await res.json()) as unknown;
}

const upstashRedisDatabaseSchema = z
  .object({
    database_id: z.string().min(1),
    database_name: z.string().min(1),
    endpoint: z.string().min(1).optional(),
    primary_region: z.string().min(1).optional(),
  })
  .passthrough();

type UpstashRedisDatabase = z.infer<typeof upstashRedisDatabaseSchema>;

const upstashVectorIndexSchema = z
  .object({
    dimension_count: z.number().int().positive().optional(),
    endpoint: z.string().min(1).optional(),
    id: z.string().min(1),
    name: z.string().min(1),
    read_only_token: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    similarity_function: z.string().min(1).optional(),
    // Secrets (never persisted/returned by our API surface).
    token: z.string().min(1).optional(),
  })
  .passthrough();

type UpstashVectorIndex = z.infer<typeof upstashVectorIndexSchema>;

function toHttpsRestUrl(endpointOrHost: string | undefined): string | null {
  if (!endpointOrHost) return null;
  const trimmed = endpointOrHost.trim();
  if (!trimmed) return null;

  // Some APIs return a full hostname; others return a slug.
  const host =
    trimmed.includes(".") || trimmed.includes(":")
      ? trimmed
      : `${trimmed}.upstash.io`;

  // Avoid leaking credentials if any appear (should not).
  const sanitized = host.replace(/^[^@]+@/, "");
  return sanitized.startsWith("http://") || sanitized.startsWith("https://")
    ? sanitized
    : `https://${sanitized}`;
}

async function listRedisDatabases(): Promise<UpstashRedisDatabase[]> {
  const data = await upstashApiJson({
    method: "GET",
    path: "/redis/databases",
  });
  const parsed = z.array(upstashRedisDatabaseSchema).safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Upstash API returned an unexpected redis databases response.",
      parsed.error,
    );
  }
  return parsed.data;
}

async function createRedisDatabase(
  input: Readonly<{ databaseName: string; primaryRegion: string }>,
): Promise<UpstashRedisDatabase> {
  const data = await upstashApiJson({
    body: {
      database_name: input.databaseName,
      platform: "aws",
      primary_region: input.primaryRegion,
      tls: true,
    },
    method: "POST",
    path: "/redis/database",
  });
  const parsed = upstashRedisDatabaseSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Upstash API returned an unexpected create-redis response.",
      parsed.error,
    );
  }
  return parsed.data;
}

async function listVectorIndices(): Promise<UpstashVectorIndex[]> {
  const data = await upstashApiJson({ method: "GET", path: "/vector/index" });
  const parsed = z.array(upstashVectorIndexSchema).safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Upstash API returned an unexpected vector indices response.",
      parsed.error,
    );
  }
  return parsed.data;
}

async function createVectorIndex(
  input: Readonly<{
    indexName: string;
    region: string;
    dimensionCount: number;
    similarityFunction: "COSINE" | "EUCLIDEAN" | "DOT_PRODUCT";
  }>,
): Promise<UpstashVectorIndex> {
  const data = await upstashApiJson({
    body: {
      dimension_count: input.dimensionCount,
      index_type: "DENSE",
      name: input.indexName,
      region: input.region,
      similarity_function: input.similarityFunction,
    },
    method: "POST",
    path: "/vector/index",
  });
  const parsed = upstashVectorIndexSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      "provider_error",
      502,
      "Upstash API returned an unexpected create-vector response.",
      parsed.error,
    );
  }
  return parsed.data;
}

/**
 * Resolve Upstash provisioning for a target app.
 *
 * @remarks
 * This foundation implementation returns a deterministic manual fallback when
 * the Upstash Developer API is not configured. When configured, it provisions
 * (or reuses) Upstash Redis + Vector resources via the Developer API.
 *
 * Secrets returned by Upstash (REST tokens) are intentionally not persisted or
 * returned; we instead emit deterministic manual steps to copy the tokens into
 * the target app's secret manager.
 *
 * @param input - Provisioning scope (project + run identity).
 * @returns Provisioning result.
 */
export async function ensureUpstashProvisioning(
  input: Readonly<{ projectSlug: string; runId: string }>,
): Promise<UpstashProvisioningResult> {
  if (isUpstashDeveloperConfigured()) {
    const redisNameHint = buildResourceNameHint({
      prefix: "upstash-redis",
      projectSlug: input.projectSlug,
      runId: input.runId,
    });
    const vectorNameHint = buildResourceNameHint({
      prefix: "upstash-vector",
      projectSlug: input.projectSlug,
      runId: input.runId,
    });

    const primaryRegion = "us-east-1";
    const vectorRegion = "us-east-1";

    const [redisDatabases, vectorIndices] = await Promise.all([
      listRedisDatabases(),
      listVectorIndices(),
    ]);

    const existingRedis = redisDatabases.find(
      (db) => db.database_name === redisNameHint,
    );
    const redisDb =
      existingRedis ??
      (await createRedisDatabase({
        databaseName: redisNameHint,
        primaryRegion,
      }));

    // Vector index dimension must match the app's embedding model.
    const embedding = await embedText("dimension probe");
    const dimensionCount = embedding.length;
    if (!Number.isFinite(dimensionCount) || dimensionCount < 1) {
      throw new AppError(
        "provider_error",
        502,
        "Failed to derive embedding dimensions for Upstash Vector provisioning.",
      );
    }

    const existingVector = vectorIndices.find(
      (idx) => idx.name === vectorNameHint,
    );
    const vectorIndex =
      existingVector ??
      (await createVectorIndex({
        dimensionCount,
        indexName: vectorNameHint,
        region: vectorRegion,
        similarityFunction: "COSINE",
      }));

    const redisRestUrl = toHttpsRestUrl(redisDb.endpoint);
    const vectorRestUrl = toHttpsRestUrl(vectorIndex.endpoint);

    const artifact = createManualFallbackArtifact({
      provider: "upstash",
      resourceNameHint: `${redisNameHint} / ${vectorNameHint}`,
      steps: [
        "Open the Upstash Console and locate the provisioned resources.",
        `Redis database name: ${redisNameHint}`,
        ...(redisRestUrl
          ? [`Redis REST URL (verify in console): ${redisRestUrl}`]
          : []),
        `Vector index name: ${vectorNameHint}`,
        ...(vectorRestUrl
          ? [`Vector REST URL (verify in console): ${vectorRestUrl}`]
          : []),
        "Copy the REST tokens (store them in your secret manager).",
        "Set target-app env vars (do not paste secrets back into this app):",
        "- UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN",
        "- UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN",
      ],
      title: "Upstash secrets setup (tokens are not persisted by automation)",
    });

    return {
      artifact,
      kind: "automated",
      provider: "upstash",
      redis: {
        created: !existingRedis,
        databaseId: redisDb.database_id,
        databaseName: redisDb.database_name,
        endpoint: redisDb.endpoint ?? null,
        primaryRegion: redisDb.primary_region ?? null,
        restUrl: redisRestUrl,
      },
      vector: {
        created: !existingVector,
        dimensionCount,
        endpoint: vectorIndex.endpoint ?? null,
        indexId: vectorIndex.id,
        indexName: vectorIndex.name,
        region: vectorIndex.region ?? null,
        restUrl: vectorRestUrl,
        similarityFunction: vectorIndex.similarity_function ?? null,
      },
    };
  }

  const redisNameHint = buildResourceNameHint({
    prefix: "upstash-redis",
    projectSlug: input.projectSlug,
    runId: input.runId,
  });
  const vectorNameHint = buildResourceNameHint({
    prefix: "upstash-vector",
    projectSlug: input.projectSlug,
    runId: input.runId,
  });

  const artifact = createManualFallbackArtifact({
    provider: "upstash",
    resourceNameHint: `${redisNameHint} / ${vectorNameHint}`,
    steps: [
      "Create an Upstash Redis database (REST) for caching/ratelimits.",
      `Redis name suggestion: ${redisNameHint}`,
      "Create an Upstash Vector index (REST) for embeddings.",
      `Vector name suggestion: ${vectorNameHint}`,
      "Store the REST tokens in your secret manager.",
      "Set UPSTASH_* REST env vars for the target app (do not paste secrets back into this app).",
    ],
    title:
      "Manual Upstash provisioning steps (Upstash Developer API not configured)",
  });

  return { artifact, kind: "manual", provider: "upstash" };
}

/**
 * Backwards-compatible alias for the historical resolver name.
 *
 * @deprecated Prefer {@link ensureUpstashProvisioning}.
 */
export const resolveUpstashProvisioning = ensureUpstashProvisioning;
