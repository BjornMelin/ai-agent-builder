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

### Auth (Neon Auth + app access control)

- `NEON_AUTH_BASE_URL` (required for `env.auth`)
  - Neon Auth base URL from the Neon Console.
  - Used by: `src/lib/auth/neon-auth.server.ts` and `src/app/api/auth/[...path]/route.ts`.
  - This app proxies Neon Auth behind `/api/auth/*`, so the browser does **not**
    need to talk to Neon Auth directly (no client-side Neon Auth URL env var is required).
- `NEON_AUTH_COOKIE_SECRET` (required for `env.auth`)
  - App-side HMAC secret used to sign cached session data cookies (minimum 32
    characters).
  - Rotation invalidates cached session data.
- `NEON_AUTH_COOKIE_DOMAIN` (optional)
  - Cookie domain for sharing session cookies across subdomains (e.g.
    `.example.com`).

Auth UI / OAuth providers:

- `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` (optional)
  - Comma-separated list of social providers to show in the auth UI.
  - Supported values (currently): `github`, `vercel`.
  - If unset: defaults to `github,vercel`.
  - If set to an empty string: disables social providers (no OAuth buttons).
  - Recommended:
    - Production/local: `github,vercel`
    - Vercel Preview branches: `vercel` (avoids GitHub OAuth callback limitations)

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
  - Used by: Drizzle DB client (planned).

### Upstash (Redis + Vector)

- `UPSTASH_REDIS_REST_URL` (required for `env.upstash`)
- `UPSTASH_REDIS_REST_TOKEN` (required for `env.upstash`)
  - Used by: caching, rate limiting, tool-call budgets.
- `UPSTASH_VECTOR_REST_URL` (required for `env.upstash`)
- `UPSTASH_VECTOR_REST_TOKEN` (required for `env.upstash`)
  - Used by: semantic search index (planned).

#### Redis client usage

Prefer `src/lib/upstash/redis.server.ts`:

```ts
import { getRedis } from "@/lib/upstash/redis.server";

const redis = getRedis();
```

### Upstash QStash (durable workflows)

- `QSTASH_TOKEN` (required for `env.qstashPublish`)
  - Used by: publishing/enqueueing QStash workflow requests.
- `QSTASH_CURRENT_SIGNING_KEY` (required for `env.qstashVerify`)
- `QSTASH_NEXT_SIGNING_KEY` (required for `env.qstashVerify`)
  - Used by: verifying QStash request signatures on inbound webhooks.

#### QStash usage

Prefer `src/lib/upstash/qstash.server.ts`:

```ts
import { getQstashClient } from "@/lib/upstash/qstash.server";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const qstash = getQstashClient();

export const POST = verifyQstashSignatureAppRouter(async (req) => {
  const body = await req.json();
  return Response.json({ ok: true, body });
});
```

### Vercel AI Gateway

- `AI_GATEWAY_API_KEY` (required for `env.aiGateway`)
  - Bearer token for the AI Gateway.
- `AI_GATEWAY_BASE_URL` (optional, default:
  `https://ai-gateway.vercel.sh/v1`)
  - Base URL for OpenAI-compatible requests to AI Gateway.

### Vercel Blob

- `BLOB_READ_WRITE_TOKEN` (required for `env.blob`)
  - Token for reading/writing blobs (uploads).

### Web research

- `EXA_API_KEY` (required for `env.webResearch`)
  - Search API key.
- `FIRECRAWL_API_KEY` (required for `env.webResearch`)
  - Extraction API key.

### Vercel Sandbox (Code Mode)

Supported auth modes:

- **OIDC token (preferred):**
  - `VERCEL_OIDC_TOKEN` (required for `env.sandbox`)
    - Token used for sandbox execution (provider-specific).
    - For local development, use `vercel env pull` to fetch environment
      variables for a Vercel project.
- **Access token (fallback):**
  - `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (required for `env.sandbox`)
  - `VERCEL_TEAM_ID` (optional; needed for team-owned resources)

Docs:

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)
- [Vercel Sandbox reference](https://vercel.com/docs/vercel-sandbox/reference/readme)

### MCP / Context7

- `CONTEXT7_API_KEY` (required for `env.context7`)
  - Only needed if your MCP transport for Context7 requires an API key.

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
  - Access token used to create/configure projects and env vars.
- `VERCEL_TEAM_ID` (optional)
  - If you operate under a Vercel team account.

Docs:

- [Vercel REST API](https://vercel.com/docs/rest-api)
- [Vercel SDK (GitHub)](https://github.com/vercel/sdk)

### Neon API (optional auto-provisioning)

- `NEON_API_KEY` (required for `env.neonApi` if using auto-provisioning)

Docs:

- [Neon API](https://neon.com/docs/api)

### Upstash Developer API (optional auto-provisioning)

> Important: Upstash Developer API is only available for native Upstash accounts;
> accounts created via some third-party platforms may not support it.

- `UPSTASH_EMAIL` (required for `env.upstashDeveloper` if using auto-provisioning)
- `UPSTASH_API_KEY` (required for `env.upstashDeveloper` if using auto-provisioning)

Docs:

- [Upstash Developer API](https://upstash.com/docs/common/account/developerapi)

## References

- Next.js env vars: [Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- Next.js Route Handlers:
  [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- Zod: [Zod](https://zod.dev/)
