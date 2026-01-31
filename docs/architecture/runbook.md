# Runbook

## Setup checklist (target)

1. Provision services:
   - Vercel AI Gateway
   - Neon Postgres
   - Upstash Redis, Vector, QStash
   - Vercel Blob store (for file uploads)
   - Exa and Firecrawl API keys

2. Configure env vars (Vercel + `.env.local`):
   - AI Gateway: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`
   - Neon: `DATABASE_URL`
   - Upstash: `UPSTASH_REDIS_*`, `UPSTASH_VECTOR_*`, `QSTASH_TOKEN`
   - QStash signing keys:
     - `QSTASH_CURRENT_SIGNING_KEY`
     - `QSTASH_NEXT_SIGNING_KEY`
   - Research: `EXA_API_KEY`, `FIRECRAWL_API_KEY`
   - Auth: `ADMIN_PASSWORD_HASH`, `APP_SESSION_SECRET`

3. DB migrations (current scripts exist now):
   - `bun run db:generate`
   - `bun run db:migrate`

4. Validate integrations:
   - run `bun run dev`
   - run `bun run ci`
   - fetch AI Gateway model catalog: `bun run fetch:models`

## Bun runtime checklist (current repo)

- `vercel.json` contains `bunVersion: "1.x"`.
  ([Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun))
- CI uses `bun install --frozen-lockfile`; commit a Bun lockfile.
- Dependency scripts are default-blocked; maintain `trustedDependencies` list.
  ([Bun lifecycle](https://bun.com/docs/pm/lifecycle))

## Failure triage

### CI failures

- Lockfile missing or changed:
  - ensure `bun.lock` exists and is committed
  - rerun `bun install` locally

- Typecheck failures:
  - ensure `bun run typegen` is executed (CI already does it)

### Run step failures (when runs are implemented)

- Inspect `run_steps.error`, tool call logs, citations
- Retry step (must be idempotent)

### Provider timeouts

- Reduce crawl depth / number of sources
- Switch models/providers in AI Gateway routing

### Vector issues

- Rebuild vector namespace for project
- Validate embedding model and metadata filters
