import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";

function formatZodEnvIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      const prefix = path.length > 0 ? `${path}: ` : "";
      return `${prefix}${issue.message}`;
    })
    .join("; ");
}

function parseFeatureEnv<S extends z.ZodTypeAny>(
  feature: string,
  schema: S,
): Readonly<z.output<S>> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new AppError(
      "env_invalid",
      500,
      `Invalid environment for feature "${feature}": ${formatZodEnvIssues(
        result.error,
      )}. See docs/ops/env.md.`,
      result.error,
    );
  }

  return result.data;
}

const envNonEmpty = z.string().trim().min(1);
const envUrl = z.string().trim().pipe(z.url());

const runtimeSchema = z
  .looseObject({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .transform((v) => ({ nodeEnv: v.NODE_ENV }));

const dbSchema = z
  .looseObject({
    DATABASE_URL: envUrl,
  })
  .transform((v) => ({ databaseUrl: v.DATABASE_URL }));

const authSchema = z
  .looseObject({
    ADMIN_PASSWORD_HASH: envNonEmpty,
    APP_SESSION_SECRET: envNonEmpty.min(32),
  })
  .transform((v) => ({
    adminPasswordHash: v.ADMIN_PASSWORD_HASH,
    sessionSecret: v.APP_SESSION_SECRET,
  }));

const upstashSchema = z
  .looseObject({
    UPSTASH_REDIS_REST_TOKEN: envNonEmpty,
    UPSTASH_REDIS_REST_URL: envUrl,
    UPSTASH_VECTOR_REST_TOKEN: envNonEmpty,
    UPSTASH_VECTOR_REST_URL: envUrl,
  })
  .transform((v) => ({
    redisRestToken: v.UPSTASH_REDIS_REST_TOKEN,
    redisRestUrl: v.UPSTASH_REDIS_REST_URL,
    vectorRestToken: v.UPSTASH_VECTOR_REST_TOKEN,
    vectorRestUrl: v.UPSTASH_VECTOR_REST_URL,
  }));

const qstashPublishSchema = z
  .looseObject({
    QSTASH_TOKEN: envNonEmpty,
  })
  .transform((v) => ({ token: v.QSTASH_TOKEN }));

const qstashVerifySchema = z
  .looseObject({
    QSTASH_CURRENT_SIGNING_KEY: envNonEmpty,
    QSTASH_NEXT_SIGNING_KEY: envNonEmpty,
  })
  .transform((v) => ({
    currentSigningKey: v.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: v.QSTASH_NEXT_SIGNING_KEY,
  }));

const aiGatewaySchema = z
  .looseObject({
    AI_GATEWAY_API_KEY: envNonEmpty,
    AI_GATEWAY_BASE_URL: envUrl.default("https://ai-gateway.vercel.sh/v1"),
  })
  .transform((v) => ({
    apiKey: v.AI_GATEWAY_API_KEY,
    baseUrl: v.AI_GATEWAY_BASE_URL,
  }));

const webResearchSchema = z
  .looseObject({
    EXA_API_KEY: envNonEmpty,
    FIRECRAWL_API_KEY: envNonEmpty,
  })
  .transform((v) => ({
    exaApiKey: v.EXA_API_KEY,
    firecrawlApiKey: v.FIRECRAWL_API_KEY,
  }));

const blobSchema = z
  .looseObject({
    BLOB_READ_WRITE_TOKEN: envNonEmpty,
  })
  .transform((v) => ({ readWriteToken: v.BLOB_READ_WRITE_TOKEN }));

const sandboxSchema = z
  .looseObject({
    VERCEL_OIDC_TOKEN: envNonEmpty,
  })
  .transform((v) => ({ oidcToken: v.VERCEL_OIDC_TOKEN }));

const context7Schema = z
  .looseObject({
    CONTEXT7_API_KEY: envNonEmpty,
  })
  .transform((v) => ({ apiKey: v.CONTEXT7_API_KEY }));

let cachedRuntimeEnv: Readonly<z.output<typeof runtimeSchema>> | undefined;
let cachedDbEnv: Readonly<z.output<typeof dbSchema>> | undefined;
let cachedAuthEnv: Readonly<z.output<typeof authSchema>> | undefined;
let cachedUpstashEnv: Readonly<z.output<typeof upstashSchema>> | undefined;
let cachedQstashPublishEnv:
  | Readonly<z.output<typeof qstashPublishSchema>>
  | undefined;
let cachedQstashVerifyEnv:
  | Readonly<z.output<typeof qstashVerifySchema>>
  | undefined;
let cachedAiGatewayEnv: Readonly<z.output<typeof aiGatewaySchema>> | undefined;
let cachedWebResearchEnv:
  | Readonly<z.output<typeof webResearchSchema>>
  | undefined;
let cachedBlobEnv: Readonly<z.output<typeof blobSchema>> | undefined;
let cachedSandboxEnv: Readonly<z.output<typeof sandboxSchema>> | undefined;
let cachedContext7Env: Readonly<z.output<typeof context7Schema>> | undefined;

/**
 * Typed, validated environment access for server code.
 *
 * This module is server-only (it imports `server-only`). Do not import it into
 * Client Components.
 */
export const env = {
  /**
   * Vercel AI Gateway.
   *
   * @returns AI Gateway env.
   */
  get aiGateway(): Readonly<z.output<typeof aiGatewaySchema>> {
    cachedAiGatewayEnv ??= parseFeatureEnv("aiGateway", aiGatewaySchema);
    return cachedAiGatewayEnv;
  },

  /**
   * Authentication / session secrets.
   *
   * @returns Auth env.
   */
  get auth(): Readonly<z.output<typeof authSchema>> {
    cachedAuthEnv ??= parseFeatureEnv("auth", authSchema);
    return cachedAuthEnv;
  },

  /**
   * Vercel Blob access token.
   *
   * @returns Blob env.
   */
  get blob(): Readonly<z.output<typeof blobSchema>> {
    cachedBlobEnv ??= parseFeatureEnv("blob", blobSchema);
    return cachedBlobEnv;
  },

  /**
   * Context7 key (only required if the chosen MCP transport needs it).
   *
   * @returns Context7 env.
   */
  get context7(): Readonly<z.output<typeof context7Schema>> {
    cachedContext7Env ??= parseFeatureEnv("context7", context7Schema);
    return cachedContext7Env;
  },

  /**
   * Database access.
   *
   * @returns Database env.
   */
  get db(): Readonly<z.output<typeof dbSchema>> {
    cachedDbEnv ??= parseFeatureEnv("db", dbSchema);
    return cachedDbEnv;
  },

  /**
   * QStash publish token (enqueue).
   *
   * @returns QStash publish env.
   */
  get qstashPublish(): Readonly<z.output<typeof qstashPublishSchema>> {
    cachedQstashPublishEnv ??= parseFeatureEnv(
      "qstashPublish",
      qstashPublishSchema,
    );
    return cachedQstashPublishEnv;
  },

  /**
   * QStash signature verification keys (verify incoming requests).
   *
   * @returns QStash verify env.
   */
  get qstashVerify(): Readonly<z.output<typeof qstashVerifySchema>> {
    cachedQstashVerifyEnv ??= parseFeatureEnv(
      "qstashVerify",
      qstashVerifySchema,
    );
    return cachedQstashVerifyEnv;
  },
  /**
   * Runtime information (safe to use for branching logic).
   *
   * @returns Runtime env.
   */
  get runtime(): Readonly<z.output<typeof runtimeSchema>> {
    cachedRuntimeEnv ??= parseFeatureEnv("runtime", runtimeSchema);
    return cachedRuntimeEnv;
  },

  /**
   * Vercel Sandbox (OIDC token).
   *
   * @returns Sandbox env.
   */
  get sandbox(): Readonly<z.output<typeof sandboxSchema>> {
    cachedSandboxEnv ??= parseFeatureEnv("sandbox", sandboxSchema);
    return cachedSandboxEnv;
  },

  /**
   * Upstash Redis + Vector.
   *
   * @returns Upstash env.
   */
  get upstash(): Readonly<z.output<typeof upstashSchema>> {
    cachedUpstashEnv ??= parseFeatureEnv("upstash", upstashSchema);
    return cachedUpstashEnv;
  },

  /**
   * Web research providers.
   *
   * @returns Web research env.
   */
  get webResearch(): Readonly<z.output<typeof webResearchSchema>> {
    cachedWebResearchEnv ??= parseFeatureEnv("webResearch", webResearchSchema);
    return cachedWebResearchEnv;
  },
} as const;
