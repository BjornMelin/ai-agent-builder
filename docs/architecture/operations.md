# Operations & Cost Controls

## Deployment

- Vercel deployment with Neon and Upstash marketplace integrations:
  - [Neon on Vercel](https://vercel.com/marketplace/neon)
  - Upstash via Vercel Marketplace (Redis/Vector/QStash)

- Vercel project configuration via `vercel.json`.
  ([vercel.json](https://vercel.com/docs/project-configuration))

## Runtime & Package Manager (Bun)

ai-agent-builder standardizes on **Bun** for local dev, CI, and Vercel
Functions.

- **Vercel Functions runtime:** set `bunVersion: "1.x"` in `vercel.json` (Vercel
  manages minor/patch). ([Bun runtime docs](https://vercel.com/docs/functions/runtimes/bun))
- **Build/install:** commit a Bun lockfile so Vercel auto-detects Bun installs.
  ([Package managers](https://vercel.com/docs/package-managers))
- **Next.js scripts:** use `bun --bun next …` for `dev`, `build`, `start`.
  ([Bun on Vercel guide](https://bun.com/docs/guides/deployment/vercel))

Operational note: Bun runtime on Vercel is in public beta; keep rollback path
documented (remove `bunVersion` and rely on Node runtime).

See also:

- [Vercel blog: Bun runtime on Functions](https://vercel.com/blog/bun-runtime-on-vercel-functions)
- [Vercel changelog (beta)](https://vercel.com/changelog/bun-runtime-now-in-public-beta-for-vercel-functions)

## AI Gateway controls

AI Gateway provides unified model access and centralized budgets/monitoring.
([AI Gateway](https://vercel.com/docs/ai-gateway))

Operational controls:

- per-run budget caps
- per-step max agent steps
- tool-call caps (maxExaQueries, maxCrawlUrls, maxSandboxMinutes)
- store token usage per step to audit cost

## Caching

Use Next.js caching primitives and Redis:

- `use cache` for stable server-side loaders.
  ([use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache))
- Upstash Redis for Exa/Firecrawl/MCP caching and rate limiting.
  ([Upstash Redis](https://upstash.com/docs/redis/sdks/ts/overview))

## Background execution

Run long pipelines via QStash.
([QStash Next.js](https://upstash.com/docs/qstash/quickstarts/vercel-nextjs))

## Monitoring

Persist and surface:

- run and step timeline (status, latency, token usage, errors)
- tool call counts and cache hit/miss
- provider outage detection (tool failures)
- “retry step” button (idempotent)

## Model catalog maintenance

The repo includes `scripts/fetch-models.sh` which fetches the AI Gateway model
catalog into `docs/ai-gateway-models.json`.

Operational policy:

- refresh models after changing AI Gateway routing policies
- commit the JSON for deterministic UI model picker defaults
