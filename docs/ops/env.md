# Environment Variables

This project centralizes environment access in `src/lib/env.ts`.

- Do not read `process.env` directly in non-test files under `src/**` (tooling
  configs may be the exception, e.g. `drizzle.config.ts`). Unit test files
  (e.g. `*.test.ts` / `*.test.tsx`) may read and mutate `process.env` as part of
  their test setup.
  - Client Components may read `process.env.NEXT_PUBLIC_*` values directly.
- Do not import `@/lib/env` into Client Components (it is server-only).
- Required variables are validated lazily (on first access to a feature gate)
  so optional features do not break builds.

## Files

- `src/lib/env.ts`: typed env + feature gates (Zod v4).
- `src/lib/core/errors.ts`: `AppError` + JSON response helpers used by Route
  Handlers and Server Actions.
- `src/lib/upstash/redis.server.ts`: Upstash Redis client (no `process.env` access).
- `src/lib/upstash/qstash.server.ts`: QStash client + Route Handler verification
  wrapper.
- `.env.example`: canonical list of variables and placeholders.

## Variables

### App

- `APP_BASE_URL` (required for `env.app`)
  - Canonical app URL used for server-to-server callbacks (QStash worker URLs).
  - Used by: upload→ingest QStash publish (`src/app/api/upload/route.ts`).
  - Must match the deployed host and be HTTPS in production.
  - For Vercel Preview branches, this repo can auto-manage a branch-scoped value
    via `.github/workflows/vercel-preview-env-sync.yml` by resolving the READY
    preview deployment URL and upserting `APP_BASE_URL` with `gitBranch`.
  - Cleanup for closed PR branches is handled (best effort) by
    `.github/workflows/vercel-preview-env-cleanup.yml`.

### Auth (Neon Auth + app access control)

- `NEON_AUTH_BASE_URL` (required for `env.auth`)
  - Neon Auth base URL from the Neon Console
    ([Neon Auth endpoint format](https://neon.com/blog/handling-auth-in-a-staging-environment)).
  - Used by: `src/lib/auth/neon-auth.server.ts` and `src/app/api/auth/[...path]/route.ts`.
  - This app proxies Neon Auth behind `/api/auth/*`, so the browser does **not**
    need to talk to Neon Auth directly (no client-side Neon Auth URL env var is required).
  - Any Server Component or Route Handler that calls Neon Auth session methods
    must export `export const dynamic = "force-dynamic"` so request-specific
    cookies are available (see [Route Segment Config: `dynamic`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic)).
    This applies to the Neon Auth server helper (`src/lib/auth/neon-auth.server.ts`)
    and the auth proxy route (`src/app/api/auth/[...path]/route.ts`).
  - Vercel OAuth callback URL **must** exactly match:
    - `<NEON_AUTH_BASE_URL>/callback/vercel`
    - Example: `https://<neon-auth-host>/neondb/auth/callback/vercel`
    ([Vercel OAuth callback URL format](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)).
  - Vercel Preview note: when using the Neon ↔ Vercel integration with Preview
    Branching and Neon Auth enabled, this value is injected automatically per
    Preview branch
    ([Neon Auth staging/preview callback note](https://neon.com/blog/handling-auth-in-a-staging-environment)).
- `NEON_AUTH_COOKIE_SECRET` (required for `env.auth`)
  - App-side HMAC secret used to sign cached session data cookies (minimum 32
    characters).
  - Rotation invalidates cached session data.
- `NEON_AUTH_COOKIE_DOMAIN` (optional)
  - Cookie domain for sharing session cookies across subdomains (e.g.
    `.example.com`).

Local Neon Auth diagnostics (optional helpers):

- `NEON_AUTH_LOCAL_AGENT_USER_EMAIL` (optional)
  - Convenience value for local smoke tests and scripted auth checks.
- `NEON_AUTH_LOCAL_AGENT_USER_PASS` (optional)
  - Convenience value for local smoke tests and scripted auth checks.

Auth UI / OAuth providers:

- `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` (optional)
  - Comma-separated list of social providers to show in the auth UI.
  - Supported values (currently): `github`, `vercel`.
  - If unset: defaults to `github,vercel`.
  - If set to an empty string: disables social providers (no OAuth buttons).
  - Recommended:
    - Local/development: `vercel`
    - Production: `github,vercel`
    - Vercel Preview branches: *(empty)* disables social providers to avoid
      per-preview Vercel OAuth callback URL allowlisting (Neon Auth uses a
      branch-specific callback URL)
      ([Vercel OAuth callback URL formats](https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard)).
  - Ensure each provider is configured in Neon Auth and that the provider's
    callback URL (e.g. Vercel) matches the Neon Auth callback derived above
    ([Neon Auth OAuth setup](https://neon.com/docs/auth/guides/setup-oauth)).

App-level access control (cost control):

- `AUTH_ACCESS_MODE` (optional, default: `restricted`)
  - `restricted`: only allow authenticated users whose email is in
    `AUTH_ALLOWED_EMAILS`.
  - `open`: allow any authenticated user (only after BYOK is implemented).
- `AUTH_ALLOWED_EMAILS` (required when `AUTH_ACCESS_MODE=restricted`)
  - Comma-separated list of allowed emails (case-insensitive).
  - The app denies access to authenticated users who are not allowlisted.

### Database (Neon Postgres)

- `DATABASE_URL` (required for `env.db`)
  - Postgres connection string.
  - Security recommendation: prefer Neon URLs that include
    `sslmode=verify-full`.
  - Used by: Drizzle DB client (`src/db/client.ts`) and server-only DAL modules
    (`src/lib/data/*.server.ts`).
  - On Vercel Fluid compute, DB connections are pooled with `pg` and integrated
    with Vercel’s pooling semantics via `attachDatabasePool`.
    ([Neon: Connecting to Neon from Vercel](https://neon.com/docs/guides/vercel-connection-methods),
    [`attachDatabasePool`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package))
  - Vercel Preview note: when using the Neon ↔ Vercel integration with Preview
    Branching, this value is injected automatically per Preview branch.
    ([Neon Vercel integration](https://neon.com/docs/guides/vercel))
- `DATABASE_URL_UNPOOLED` (optional; recommended for migrations/DDL)
  - Unpooled Postgres connection string (Neon provides this alongside pooled URLs).
  - Security recommendation: prefer Neon URLs that include
    `sslmode=verify-full`.
  - Used by: Drizzle tooling (`drizzle-kit migrate`) and build-time migrations.

### Upstash (Redis + Vector)

- `UPSTASH_REDIS_REST_URL` (required for `env.upstash`)
  ([Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi))
- `UPSTASH_REDIS_REST_TOKEN` (required for `env.upstash`)
  ([Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi))
  - Used by: caching, rate limiting, tool-call budgets.
- `UPSTASH_VECTOR_REST_URL` (required for `env.upstash`)
  ([Upstash Vector REST API](https://upstash.com/docs/vector/features/metadata))
- `UPSTASH_VECTOR_REST_TOKEN` (required for `env.upstash`)
  ([Upstash Vector REST API](https://upstash.com/docs/vector/features/metadata))
  - Used by: semantic search index (uploads + artifacts).

#### Redis client usage

Prefer `src/lib/upstash/redis.server.ts`:

```ts
import { getRedis } from "@/lib/upstash/redis.server";

const redis = getRedis();
```

### Upstash QStash (durable workflows)

- `QSTASH_TOKEN` (required for `env.qstashPublish`) (see
  [QStash env vars](https://upstash.com/docs/qstash/howto/local-development))
  - Used by: publishing/enqueueing QStash workflow requests.
- `QSTASH_CURRENT_SIGNING_KEY` (required for `env.qstashVerify`) (see
  [QStash env vars](https://upstash.com/docs/qstash/howto/local-development))
- `QSTASH_NEXT_SIGNING_KEY` (required for `env.qstashVerify`) (see
  [QStash env vars](https://upstash.com/docs/qstash/howto/local-development))
  - Used by: verifying QStash request signatures on inbound webhooks.
- `QSTASH_URL` (optional compatibility variable; not read by `src/lib/env.ts`)
  - Some integrations expose this URL automatically.
  - Keeping it in Vercel envs is safe, but app runtime does not require it.

#### QStash usage

Prefer `src/lib/upstash/qstash.server.ts`:

Implementation details: `getQstashClient` and `verifyQstashSignatureAppRouter`
in `src/lib/upstash/qstash.server.ts` wrap the official
`verifySignatureAppRouter` and verify signatures against the raw request body
before invoking your handler
([QStash signature verification](https://upstash.mintlify.dev/docs/qstash/howto/signature)).

```ts
import { getQstashClient } from "@/lib/upstash/qstash.server";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const qstash = getQstashClient();

export const POST = verifyQstashSignatureAppRouter(async (req) => {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody);
  return Response.json({ ok: true, body });
});
```

### Vercel AI Gateway

- `AI_GATEWAY_API_KEY` (required for `env.aiGateway`)
  - Bearer token for the AI Gateway
    ([AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication)).
- `AI_GATEWAY_BASE_URL` (optional, default:
  `https://ai-gateway.vercel.sh/v3/ai`)
  - Base URL for AI Gateway provider requests
    ([AI Gateway provider](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway)).
- `AI_GATEWAY_CHAT_MODEL` (optional, default: `xai/grok-4.1-fast-reasoning`)
  - Default AI Gateway model ID used for chat generation.
- `AI_GATEWAY_EMBEDDING_MODEL` (optional, default: `alibaba/qwen3-embedding-4b`)
  - Default AI Gateway model ID used for embeddings (uploads + retrieval).

### Vercel Blob

- `BLOB_READ_WRITE_TOKEN` (required for `env.blob`)
  - Token for reading/writing blobs (uploads)
    ([Vercel Blob SDK](https://vercel.com/docs/storage/vercel-blob/using-blob-sdk)).

### Web research

- `EXA_API_KEY` (required for `env.webResearch`)
  - Search API key.
- `FIRECRAWL_API_KEY` (required for `env.webResearch`)
  - Extraction API key.

### Vercel Sandbox (Code Mode)

Supported auth modes:

- **OIDC token (preferred):**
- `VERCEL_OIDC_TOKEN` (required for `env.sandbox`)
  - Token used for sandbox execution (provider-specific)
      ([Sandbox auth](https://vercel.com/docs/vercel-sandbox/concepts/authentication)).
  - For local development, use `vercel env pull` to fetch environment
      variables for a Vercel project
      ([Vercel CLI env pull](https://vercel.com/docs/cli/env#exporting-development-environment-variables)).
- **Access token (fallback):**
- `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (required for `env.sandbox`)
- `VERCEL_TEAM_ID` (optional; needed for team-owned resources)
  ([Sandbox auth](https://vercel.com/docs/vercel-sandbox/concepts/authentication)).

Docs:

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)
- [Vercel Sandbox reference](https://vercel.com/docs/vercel-sandbox/reference/readme)

### MCP / Context7

- `CONTEXT7_API_KEY` (required for `env.context7`)
  - Only needed if your MCP transport for Context7 requires an API key.

## Recommended topology and tier mapping

This section captures the operational baseline used in this repository.

- Scope: this repository (`ai-agent-builder`) only.
- Neon Preview Branching integration is the source of truth for preview
  `DATABASE_URL` and preview `NEON_AUTH_BASE_URL`.
- Upstash isolation policy:
  - Production uses dedicated Redis/Vector resources.
  - Development and Preview share non-production Redis/Vector resources.

### Upstash provisioning profile

Recommended resource naming (console/dashboard):

- Redis:
  - `ai-agent-builder-redis-nonprod` (Development + Preview)
  - `ai-agent-builder-redis-prod` (Production)
- Vector:
  - `ai-agent-builder-vector-nonprod` (Development + Preview)
  - `ai-agent-builder-vector-prod` (Production)

Recommended Vector index settings:

- Index type: `HYBRID`
- Similarity: `COSINE`
- Dense dimension: `2560` (aligned with `alibaba/qwen3-embedding-4b`)
- Sparse mode: BM25 / default sparse (for hybrid)
- Region: align with current Neon/Vercel region.

### Environment variable tier matrix

| Variable | Development | Preview | Production | Notes |
| --- | --- | --- | --- | --- |
| `APP_BASE_URL` | Required | Required | Required | Dev: `http://localhost:3000`; Preview: branch-scoped preview URL; Prod: primary prod URL |
| `NEON_AUTH_BASE_URL` | Required | Integration-injected | Required | Preview branch value is injected by Neon↔Vercel integration |
| `NEON_AUTH_COOKIE_SECRET` | Required | Required | Required | Minimum 32 chars |
| `NEON_AUTH_COOKIE_DOMAIN` | Optional | Optional | Optional | Set only when sharing cookies across subdomains |
| `AUTH_ACCESS_MODE` | Required | Required | Required | `restricted` by default |
| `AUTH_ALLOWED_EMAILS` | Required when restricted | Required when restricted | Required when restricted | Comma-separated allowlist |
| `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` | Required | Required | Required | Dev: `vercel`; Preview: empty string; Prod: `github,vercel` |
| `DATABASE_URL` | Required | Integration-injected | Required | Use pooled Neon URL |
| `DATABASE_URL_UNPOOLED` | Recommended | Recommended | Recommended | Preferred for migrations/DDL tooling |
| `UPSTASH_REDIS_REST_URL` | Required | Required | Required | Nonprod URL for Dev/Preview, prod URL for Production |
| `UPSTASH_REDIS_REST_TOKEN` | Required | Required | Required | Nonprod token for Dev/Preview, prod token for Production |
| `UPSTASH_VECTOR_REST_URL` | Required | Required | Required | Nonprod URL for Dev/Preview, prod URL for Production |
| `UPSTASH_VECTOR_REST_TOKEN` | Required | Required | Required | Nonprod token for Dev/Preview, prod token for Production |
| `QSTASH_TOKEN` | Required | Required | Required | Publish token |
| `QSTASH_CURRENT_SIGNING_KEY` | Required | Required | Required | Verify key |
| `QSTASH_NEXT_SIGNING_KEY` | Required | Required | Required | Verify key |
| `AI_GATEWAY_API_KEY` | Required | Required | Required | Gateway auth token |
| `AI_GATEWAY_BASE_URL` | Required | Required | Required | Must use `https://ai-gateway.vercel.sh/v3/ai` |
| `AI_GATEWAY_CHAT_MODEL` | Recommended | Recommended | Recommended | Default: `xai/grok-4.1-fast-reasoning` |
| `AI_GATEWAY_EMBEDDING_MODEL` | Recommended | Recommended | Recommended | Default: `alibaba/qwen3-embedding-4b` |
| `BLOB_READ_WRITE_TOKEN` | Required | Required | Required | Blob uploads |
| `EXA_API_KEY` | Required | Required | Required | Web research |
| `FIRECRAWL_API_KEY` | Required | Required | Required | Web research |
| `CONTEXT7_API_KEY` | Required | Required | Required | MCP/Context7 transport |

Preview branch override for `APP_BASE_URL`:

- Auto-managed: `.github/workflows/vercel-preview-env-sync.yml`.
- Manual fallback (when needed):
  - `vercel env add APP_BASE_URL preview <git-branch>`
  - `vercel env update APP_BASE_URL preview <git-branch>`

## Dashboard setup checklist

### Neon ↔ Vercel integration

1. Confirm Vercel project is linked to the intended Neon project.
2. Enable Preview Branching in the integration.
3. Ensure Neon Auth preview support is enabled so `NEON_AUTH_BASE_URL` is
   injected for preview branches.
4. Verify Sign in with Vercel callback URL in Vercel OAuth app:
   - `<NEON_AUTH_BASE_URL>/callback/vercel`
5. Verify Neon Auth trusted domains include:
   - Production domain(s)
   - `http://localhost:3000`
   - Preview domain(s), manually or via
     `.github/workflows/neon-auth-trusted-domains.yml`.

### Vercel project environments

1. Ensure all required vars in the matrix above are set for Development,
   Preview, and Production.
2. Ensure `APP_BASE_URL` exists in all three tiers.
3. Ensure Upstash Redis/Vector vars exist in all three tiers.
4. Ensure `AI_GATEWAY_BASE_URL` is set to `/v3/ai` (not `/v1`).

### Optional high-privilege automation vars

Only required for full repo+infra automation workflows:

- `GITHUB_TOKEN`
- `NEON_API_KEY`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` (optional for team scope)
- `UPSTASH_EMAIL`
- `UPSTASH_API_KEY`
- `VERCEL_PROJECT_ID` (only needed for sandbox access-token fallback mode)

## Comprehensive validation checklist

Run these after dashboard/CLI setup changes and before sign-off.

### A) Contract completeness checks

```bash
# Development
vercel env run -e development -- bun -e 'const k=["APP_BASE_URL","NEON_AUTH_BASE_URL","DATABASE_URL","UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","UPSTASH_VECTOR_REST_URL","UPSTASH_VECTOR_REST_TOKEN","QSTASH_TOKEN","AI_GATEWAY_API_KEY","BLOB_READ_WRITE_TOKEN"]; for (const x of k) console.log(x, process.env[x]?"ok":"missing")'

# Preview branch
vercel env run -e preview --git-branch <branch> -- bun -e 'const k=["APP_BASE_URL","DATABASE_URL","NEON_AUTH_BASE_URL","UPSTASH_REDIS_REST_URL","UPSTASH_VECTOR_REST_URL","QSTASH_TOKEN"]; for (const x of k) console.log(x, process.env[x]?"ok":"missing")'

# Production
vercel env run -e production -- bun -e 'const k=["APP_BASE_URL","NEON_AUTH_BASE_URL","DATABASE_URL","UPSTASH_REDIS_REST_URL","UPSTASH_VECTOR_REST_URL","QSTASH_TOKEN","AI_GATEWAY_API_KEY","BLOB_READ_WRITE_TOKEN"]; for (const x of k) console.log(x, process.env[x]?"ok":"missing")'
```

Pass criteria: all required keys print `ok`.

### B) AI Gateway runtime smoke check

```bash
vercel env run -e production -- bun -e 'import { createGateway, embed } from "ai"; const p=createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: process.env.AI_GATEWAY_BASE_URL }); const r=await embed({ model:p.embeddingModel("alibaba/qwen3-embedding-4b"), value:"health check" }); console.log("EMBED_OK", r.embedding.length)'

vercel env run -e preview --git-branch <branch> -- bun -e 'import { createGateway, embed } from "ai"; const p=createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: process.env.AI_GATEWAY_BASE_URL }); const r=await embed({ model:p.embeddingModel("alibaba/qwen3-embedding-4b"), value:"health check" }); console.log("EMBED_OK", r.embedding.length)'
```

Pass criteria: command succeeds and prints `EMBED_OK 2560`.

### C) Upstash connectivity checks

```bash
# Redis REST ping
vercel env run -e production -- bun -e 'const r=await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`,{headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`}}); console.log("REDIS", r.status, await r.text())'

# Vector API client check
vercel env run -e production -- bun -e 'import { Index } from "@upstash/vector"; const i=new Index({ url: process.env.UPSTASH_VECTOR_REST_URL, token: process.env.UPSTASH_VECTOR_REST_TOKEN }); const x=await i.info(); console.log("VECTOR_OK", Boolean(x))'

# QStash API auth check
vercel env run -e production -- bun -e 'const r=await fetch("https://qstash.upstash.io/v2/topics",{headers:{Authorization:`Bearer ${process.env.QSTASH_TOKEN}`}}); console.log("QSTASH", r.status)'
```

Pass criteria:

- Redis returns `200` with `PONG` payload shape.
- Vector check succeeds.
- QStash returns `200`.

### D) Database connectivity and migration path

```bash
# Connectivity
vercel env run -e production -- bun -e 'import { Client } from "pg"; const c=new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); const r=await c.query("select 1 as ok"); console.log(r.rows[0]); await c.end()'

# Migration path
vercel env run -e production -- bun run db:migrate
```

Pass criteria: connectivity query and migration command both succeed.

### E) Preview deployment behavior

1. Create/update a PR branch and wait for preview deployment readiness.
2. Verify branch-scoped `APP_BASE_URL` exists:
   - `vercel env list preview <branch>`
3. Open preview deployment and verify auth + app load.
4. Upload a file and verify async ingestion completes (default path uses QStash).
5. Verify retrieval/UI search returns results.

### F) Log sweep

```bash
vercel logs <preview-deployment-url> --since 1h
vercel logs <production-deployment-url> --since 1h
```

Pass criteria:

- No `env_invalid` or missing-env errors in runtime logs.
- No AI Gateway request format/base URL errors.
- No DB connection/auth errors.

### Regression scenarios

1. Missing env regression: remove a required var in Development and confirm the
   app surfaces explicit env errors, then restore.
2. AI base URL regression: set `AI_GATEWAY_BASE_URL` to `/v1`, verify embedding
   failure, then restore `/v3/ai` and re-verify.
3. Preview branch scenario: create new branch, confirm Neon preview injection
   and branch-scoped `APP_BASE_URL`, then test upload async ingestion path.

## Implementation / deploy automation (optional)

These variables are only required if you want the app to automate repo changes,
provisioning, and deployments. Without them, Implementation Runs can still
generate plans and manual instructions.

### GitHub (RepoOps)

- `GITHUB_TOKEN` (required for `env.github`)
  - Fine-grained PAT recommended.
- `GITHUB_WEBHOOK_SECRET` (optional)
  - Shared secret for webhook signature verification.

Docs:

- [GitHub REST API](https://docs.github.com/en/rest)
- [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

### Vercel API (deployment automation)

- `VERCEL_TOKEN` (required for `env.vercelApi`)
  - Access token used to create/configure projects and env vars
    ([Vercel REST API](https://vercel.com/docs/rest-api)).
- `VERCEL_TEAM_ID` (optional)
  - If you operate under a Vercel team account.

Docs:

- [Vercel REST API](https://vercel.com/docs/rest-api)
- [Vercel SDK (GitHub)](https://github.com/vercel/sdk)

### Neon API (optional auto-provisioning)

- `NEON_API_KEY` (required for `env.neonApi` if using auto-provisioning)
  ([Neon API keys](https://neon.com/docs/manage/api-keys))

Docs:

- [Neon API](https://neon.com/docs/reference/api-reference)

### Upstash Developer API (optional auto-provisioning)

> Important: Upstash Developer API is only available for native Upstash accounts;
> accounts created via some third-party platforms may not support it
> ([Upstash Developer API](https://upstash.com/docs/common/account/developerapi)).

- `UPSTASH_EMAIL` (required for `env.upstashDeveloper` if using auto-provisioning)
- `UPSTASH_API_KEY` (required for `env.upstashDeveloper` if using auto-provisioning)
  ([Upstash Developer API](https://upstash.com/docs/common/account/developerapi))

Docs:

- [Upstash Developer API](https://upstash.com/docs/common/account/developerapi)

## References

- Next.js env vars: [Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- Next.js Route Handlers:
  [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Zod: [Zod](https://zod.dev/)
- Upstash QStash env vars:
  [QStash local development](https://upstash.com/docs/qstash/howto/local-development)
