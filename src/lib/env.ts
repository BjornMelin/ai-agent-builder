import "server-only";

import { z } from "zod";
import { parseAuthSocialProviders } from "@/lib/auth/social-providers";
import { AppError } from "@/lib/core/errors";

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
const envOptionalTrimmed = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(1).optional(),
);

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Normalize an email address for consistent allowlist matching.
 *
 * @param value - Raw email string to normalize.
 * @returns Trimmed, lowercased email address.
 */
export function normalizeEmail(value: string): string {
  // Lowercasing is sufficient for allowlist matching (domain-part is case-insensitive;
  // local-part case sensitivity is rarely enforced in practice and not worth the complexity here).
  return value.trim().toLowerCase();
}

const runtimeSchema = z
  .looseObject({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    VERCEL: z.string().optional(),
  })
  .transform((v) => ({
    isVercel: v.VERCEL === "1",
    nodeEnv: v.NODE_ENV,
  }));

const dbSchema = z
  .looseObject({
    DATABASE_URL: envUrl,
  })
  .transform((v) => ({ databaseUrl: v.DATABASE_URL }));

const authSchema = z
  .looseObject({
    // App access control (cost control): restrict who can access the app even if they can authenticate.
    AUTH_ACCESS_MODE: z.enum(["restricted", "open"]).default("restricted"),
    AUTH_ALLOWED_EMAILS: envOptionalTrimmed,
    // Neon Auth
    NEON_AUTH_BASE_URL: envUrl,
    NEON_AUTH_COOKIE_DOMAIN: envOptionalTrimmed,
    NEON_AUTH_COOKIE_SECRET: envNonEmpty.min(32),
  })
  .superRefine((v, ctx) => {
    if (v.AUTH_ACCESS_MODE === "restricted" && !v.AUTH_ALLOWED_EMAILS) {
      ctx.addIssue({
        code: "custom",
        message:
          "AUTH_ALLOWED_EMAILS is required when AUTH_ACCESS_MODE is 'restricted'.",
        path: ["AUTH_ALLOWED_EMAILS"],
      });
    }
  })
  .transform((v) => {
    const allowedEmails =
      v.AUTH_ACCESS_MODE === "restricted" && v.AUTH_ALLOWED_EMAILS
        ? Array.from(
            new Set(
              parseCommaSeparatedList(v.AUTH_ALLOWED_EMAILS).map(
                normalizeEmail,
              ),
            ),
          )
        : [];

    return {
      accessMode: v.AUTH_ACCESS_MODE,
      allowedEmails,
      baseUrl: v.NEON_AUTH_BASE_URL,
      cookieDomain: v.NEON_AUTH_COOKIE_DOMAIN,
      cookieSecret: v.NEON_AUTH_COOKIE_SECRET,
    };
  });

const authUiSchema = z
  .looseObject({
    // Auth UI / social providers (app-level UX control)
    // - unset: defaults to "github,vercel"
    // - empty string: disables social providers
    NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS: z.string().optional(),
  })
  .transform((v) => ({
    socialProviders: parseAuthSocialProviders(
      v.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS,
    ),
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
    AI_GATEWAY_BASE_URL: envUrl.default("https://ai-gateway.vercel.sh/v3/ai"),
    // Optional defaults for model selection (config-driven, not hardcoded at call sites).
    // These are AI Gateway model IDs, e.g. "xai/grok-4.1-fast-reasoning".
    AI_GATEWAY_CHAT_MODEL: envOptionalTrimmed.default(
      "xai/grok-4.1-fast-reasoning",
    ),
    AI_GATEWAY_EMBEDDING_MODEL: envOptionalTrimmed.default(
      "alibaba/qwen3-embedding-4b",
    ),
  })
  .transform((v) => ({
    apiKey: v.AI_GATEWAY_API_KEY,
    baseUrl: v.AI_GATEWAY_BASE_URL,
    chatModel: v.AI_GATEWAY_CHAT_MODEL,
    embeddingModel: v.AI_GATEWAY_EMBEDDING_MODEL,
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
    VERCEL_OIDC_TOKEN: envOptionalTrimmed,
    VERCEL_PROJECT_ID: envOptionalTrimmed,
    VERCEL_TEAM_ID: envOptionalTrimmed,
    VERCEL_TOKEN: envOptionalTrimmed,
  })
  .superRefine((v, ctx) => {
    const hasOidcToken = Boolean(v.VERCEL_OIDC_TOKEN);
    const hasAccessToken = Boolean(v.VERCEL_TOKEN);
    const hasProjectId = Boolean(v.VERCEL_PROJECT_ID);

    if (!hasOidcToken && !hasAccessToken) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide either VERCEL_OIDC_TOKEN (preferred) or VERCEL_TOKEN + VERCEL_PROJECT_ID for Sandbox auth.",
        path: ["VERCEL_OIDC_TOKEN"],
      });
    }

    if (!hasOidcToken && hasAccessToken && !hasProjectId) {
      ctx.addIssue({
        code: "custom",
        message:
          "VERCEL_PROJECT_ID is required when using VERCEL_TOKEN for Sandbox auth.",
        path: ["VERCEL_PROJECT_ID"],
      });
    }
  })
  .transform((v) => {
    if (v.VERCEL_OIDC_TOKEN) {
      return {
        auth: "oidc" as const,
        oidcToken: v.VERCEL_OIDC_TOKEN,
        teamId: v.VERCEL_TEAM_ID,
      };
    }

    const token = v.VERCEL_TOKEN;
    const projectId = v.VERCEL_PROJECT_ID;

    if (!token || !projectId) {
      // This should be unreachable due to the schema refinement above.
      throw new AppError(
        "env_invalid",
        500,
        'Invalid environment for feature "sandbox": missing VERCEL_TOKEN or VERCEL_PROJECT_ID. See docs/ops/env.md.',
      );
    }

    return {
      auth: "token" as const,
      projectId,
      teamId: v.VERCEL_TEAM_ID,
      token,
    };
  });

const context7Schema = z
  .looseObject({
    CONTEXT7_API_KEY: envNonEmpty,
  })
  .transform((v) => ({ apiKey: v.CONTEXT7_API_KEY }));

const githubSchema = z
  .looseObject({
    GITHUB_TOKEN: envNonEmpty,
    GITHUB_WEBHOOK_SECRET: envOptionalTrimmed,
  })
  .transform((v) => ({
    token: v.GITHUB_TOKEN,
    webhookSecret: v.GITHUB_WEBHOOK_SECRET,
  }));

const vercelApiSchema = z
  .looseObject({
    VERCEL_TEAM_ID: envOptionalTrimmed,
    VERCEL_TOKEN: envNonEmpty,
  })
  .transform((v) => ({
    teamId: v.VERCEL_TEAM_ID,
    token: v.VERCEL_TOKEN,
  }));

const neonApiSchema = z
  .looseObject({
    NEON_API_KEY: envNonEmpty,
  })
  .transform((v) => ({ apiKey: v.NEON_API_KEY }));

const upstashDeveloperSchema = z
  .looseObject({
    UPSTASH_API_KEY: envNonEmpty,
    UPSTASH_EMAIL: z.string().trim().pipe(z.email()),
  })
  .transform((v) => ({
    apiKey: v.UPSTASH_API_KEY,
    email: v.UPSTASH_EMAIL,
  }));

let cachedRuntimeEnv: Readonly<z.output<typeof runtimeSchema>> | undefined;
let cachedDbEnv: Readonly<z.output<typeof dbSchema>> | undefined;
let cachedAuthEnv: Readonly<z.output<typeof authSchema>> | undefined;
let cachedAuthUiEnv: Readonly<z.output<typeof authUiSchema>> | undefined;
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
let cachedGithubEnv: Readonly<z.output<typeof githubSchema>> | undefined;
let cachedVercelApiEnv: Readonly<z.output<typeof vercelApiSchema>> | undefined;
let cachedNeonApiEnv: Readonly<z.output<typeof neonApiSchema>> | undefined;
let cachedUpstashDeveloperEnv:
  | Readonly<z.output<typeof upstashDeveloperSchema>>
  | undefined;

/**
 * Typed, validated environment access for server code.
 *
 * This module is server-only (it imports `server-only`). Do not import it into
 * Client Components.
 */
export const env = {
  /**
   * Returns the Vercel AI Gateway configuration used by server code.
   *
   * @returns AI Gateway env.
   */
  get aiGateway(): Readonly<z.output<typeof aiGatewaySchema>> {
    cachedAiGatewayEnv ??= parseFeatureEnv("aiGateway", aiGatewaySchema);
    return cachedAiGatewayEnv;
  },

  /**
   * Returns the authentication/access control configuration.
   *
   * @returns Auth env.
   */
  get auth(): Readonly<z.output<typeof authSchema>> {
    cachedAuthEnv ??= parseFeatureEnv("auth", authSchema);
    return cachedAuthEnv;
  },

  /**
   * Returns the public auth UI configuration (no secrets).
   *
   * @returns Auth UI env.
   */
  get authUi(): Readonly<z.output<typeof authUiSchema>> {
    cachedAuthUiEnv ??= parseFeatureEnv("authUi", authUiSchema);
    return cachedAuthUiEnv;
  },

  /**
   * Returns the Vercel Blob configuration used for uploads.
   *
   * @returns Blob env.
   */
  get blob(): Readonly<z.output<typeof blobSchema>> {
    cachedBlobEnv ??= parseFeatureEnv("blob", blobSchema);
    return cachedBlobEnv;
  },

  /**
   * Returns the Context7 configuration for MCP access.
   *
   * Context7 key is only required if the chosen MCP transport needs it.
   *
   * @returns Context7 env.
   */
  get context7(): Readonly<z.output<typeof context7Schema>> {
    cachedContext7Env ??= parseFeatureEnv("context7", context7Schema);
    return cachedContext7Env;
  },

  /**
   * Returns the database configuration for server access.
   *
   * @returns Database env.
   */
  get db(): Readonly<z.output<typeof dbSchema>> {
    cachedDbEnv ??= parseFeatureEnv("db", dbSchema);
    return cachedDbEnv;
  },

  /**
   * Returns the GitHub API configuration for RepoOps.
   *
   * @returns GitHub env.
   */
  get github(): Readonly<z.output<typeof githubSchema>> {
    cachedGithubEnv ??= parseFeatureEnv("github", githubSchema);
    return cachedGithubEnv;
  },

  /**
   * Returns the Neon API configuration for optional provisioning.
   *
   * @returns Neon API env.
   */
  get neonApi(): Readonly<z.output<typeof neonApiSchema>> {
    cachedNeonApiEnv ??= parseFeatureEnv("neonApi", neonApiSchema);
    return cachedNeonApiEnv;
  },

  /**
   * Returns the QStash publish configuration for enqueueing requests.
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
   * Returns the QStash verification configuration for incoming requests.
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
   * Returns runtime information used for branching logic.
   *
   * @returns Runtime env.
   */
  get runtime(): Readonly<z.output<typeof runtimeSchema>> {
    cachedRuntimeEnv ??= parseFeatureEnv("runtime", runtimeSchema);
    return cachedRuntimeEnv;
  },

  /**
   * Returns the Vercel Sandbox configuration (OIDC preferred; access token fallback supported).
   *
   * @returns Sandbox env.
   */
  get sandbox(): Readonly<z.output<typeof sandboxSchema>> {
    cachedSandboxEnv ??= parseFeatureEnv("sandbox", sandboxSchema);
    return cachedSandboxEnv;
  },

  /**
   * Returns the Upstash Redis/Vector configuration for server access.
   *
   * @returns Upstash env.
   */
  get upstash(): Readonly<z.output<typeof upstashSchema>> {
    cachedUpstashEnv ??= parseFeatureEnv("upstash", upstashSchema);
    return cachedUpstashEnv;
  },

  /**
   * Returns the Upstash Developer API configuration for optional provisioning.
   *
   * Native Upstash accounts only.
   *
   * @returns Upstash Developer env.
   */
  get upstashDeveloper(): Readonly<z.output<typeof upstashDeveloperSchema>> {
    cachedUpstashDeveloperEnv ??= parseFeatureEnv(
      "upstashDeveloper",
      upstashDeveloperSchema,
    );
    return cachedUpstashDeveloperEnv;
  },

  /**
   * Returns the Vercel API configuration for deployment automation.
   *
   * @returns Vercel API env.
   */
  get vercelApi(): Readonly<z.output<typeof vercelApiSchema>> {
    cachedVercelApiEnv ??= parseFeatureEnv("vercelApi", vercelApiSchema);
    return cachedVercelApiEnv;
  },

  /**
   * Returns the web research provider configuration.
   *
   * @returns Web research env.
   */
  get webResearch(): Readonly<z.output<typeof webResearchSchema>> {
    cachedWebResearchEnv ??= parseFeatureEnv("webResearch", webResearchSchema);
    return cachedWebResearchEnv;
  },
} as const;
