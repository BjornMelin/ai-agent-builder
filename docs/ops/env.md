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
    ([Neon Auth OAuth providers](https://neon.tech/docs/neon-auth/oauth-authentication)).

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
  - Vercel Preview note: when using the Neon ↔ Vercel integration with Preview
    Branching, this value is injected automatically per Preview branch.
    ([Neon Vercel integration](https://neon.com/docs/guides/vercel))

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
  - Used by: semantic search index (planned).

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
  `https://ai-gateway.vercel.sh/v1`)
  - Base URL for OpenAI-compatible requests to AI Gateway
    ([OpenAI-compatible API](https://vercel.com/docs/ai-gateway/openai-compatibility)).

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
  ([Neon API keys](https://neon.tech/docs/manage/api-keys))

Docs:

- [Neon API](https://neon.com/docs/api)

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
