# Environment Variables

This project centralizes environment access in `src/lib/env.ts`.

- Do not read `process.env` directly in `src/**` (tooling configs may be the
  exception, e.g. `drizzle.config.ts`).
- Do not import `@/lib/env` into Client Components (it is server-only).
- Required variables are validated lazily (on first access to a feature gate)
  so optional features do not break builds.

## Files

- `src/lib/env.ts`: typed env + feature gates (Zod v4).
- `src/lib/errors.ts`: `AppError` + JSON response helpers used by Route
  Handlers and Server Actions.
- `src/lib/upstash/redis.ts`: Upstash Redis client (no `process.env` access).
- `src/lib/upstash/qstash.ts`: QStash client + Route Handler verification
  wrapper.
- `.env.example`: canonical list of variables and placeholders.

## Variables

### Auth (single-user)

- `ADMIN_PASSWORD_HASH` (required for `env.auth`)
  - Argon2id password hash for the admin user.
  - Used by: login Route Handler (see `docs/architecture/spec/SPEC-0002-*`).
- `APP_SESSION_SECRET` (required for `env.auth`)
  - Secret used to sign/encrypt session cookies.
  - Rotation invalidates existing sessions.
  - Used by: session cookie helpers (see `docs/architecture/spec/SPEC-0002-*`).

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

Prefer `src/lib/upstash/redis.ts`:

```ts
import { getRedis } from "@/lib/upstash/redis";

const redis = getRedis();
```

### Upstash QStash (durable workflows)

- `QSTASH_TOKEN` (required for `env.qstashPublish`)
  - Used by: publishing/enqueueing QStash workflow requests.
- `QSTASH_CURRENT_SIGNING_KEY` (required for `env.qstashVerify`)
- `QSTASH_NEXT_SIGNING_KEY` (required for `env.qstashVerify`)
  - Used by: verifying QStash request signatures on inbound webhooks.

#### QStash usage

Prefer `src/lib/upstash/qstash.ts`:

```ts
import { getQstashClient } from "@/lib/upstash/qstash";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash";

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

- `VERCEL_OIDC_TOKEN` (required for `env.sandbox`)
  - Token used for sandbox execution (provider-specific).

### MCP / Context7

- `CONTEXT7_API_KEY` (required for `env.context7`)
  - Only needed if your MCP transport for Context7 requires an API key.

## References

- Next.js env vars:
  `https://nextjs.org/docs/app/guides/environment-variables`
- Next.js Route Handlers:
  `https://nextjs.org/docs/app/building-your-application/routing/route-handlers`
- Zod:
  `https://zod.dev/`
