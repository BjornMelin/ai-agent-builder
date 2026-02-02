# AI Agent Builder

![Bun](https://img.shields.io/badge/Bun-1.x-000000?logo=bun&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000000)
![Tailwind](https://img.shields.io/badge/TailwindCSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![Postgres](https://img.shields.io/badge/DB-Neon_Postgres-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Cache-Upstash-00E9A3?logo=redis&logoColor=white)

A private, production-focused system for turning rough product inputs (pitch
decks, docs, spreadsheets, notes) into a complete **implementation engine**:
research → specs → plan → code → verify → deploy (with a deterministic audit
trail).

## What it does

- Ingests source material: PDFs, slides, docs, markdown, spreadsheets.
- Runs deep research and validation (with citations).
- Produces formal, versioned artifacts (PRD, ADRs, specs, security, roadmap).
- Supports an implementation/deployment phase (spec’d) to:
  - connect a target GitHub repo
  - plan changes traceable to artifacts
  - apply patches + open PRs
  - run verification in Vercel Sandbox
  - provision/connect infra and deploy

## High-level architecture

```mermaid
flowchart LR
  A[Uploads / Notes] --> B[Ingestion + Index]
  B --> C[Research Agents]
  C --> D[Gap + Differentiation]
  D --> E[PRD + ADR + Architecture]
  E --> F[Export + Versioned Artifacts]
  E --> G[Implementation Runs]
  G --> H[PRs + Verification + Deployments]
```

## Tech stack

- Runtime + tooling: Bun
- Web: Next.js 16 (App Router), React 19
- Styling/UI: TailwindCSS v4, shadcn/ui, Lucide
- Auth: Neon Auth (managed auth + UI components)
- AI: Vercel AI SDK v6 + AI Gateway
- DB: Neon Postgres + Drizzle ORM
- Infra helpers: Upstash (Redis, QStash, Vector)
- Quality: Biome (format/lint) + ESLint (TSDoc/JSDoc enforcement) + Vitest
- Typing/Schema: Zod v4
- Releases: Release Please (semver via Conventional Commits)

## Implementation engine (specs)

- End-to-end implementation runs: [`docs/architecture/spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md`](./docs/architecture/spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
- RepoOps (GitHub): [`docs/architecture/spec/SPEC-0017-repo-ops-and-github-integration.md`](./docs/architecture/spec/SPEC-0017-repo-ops-and-github-integration.md)
- Provisioning + deploy automation: [`docs/architecture/spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md`](./docs/architecture/spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)
- Sandbox verification jobs: [`docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`](./docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)
- Workspace + search UX: [`docs/architecture/spec/SPEC-0020-project-workspace-and-search.md`](./docs/architecture/spec/SPEC-0020-project-workspace-and-search.md)
- GitOps + deploy ADRs:
  - [`docs/architecture/adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md`](./docs/architecture/adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md)
  - [`docs/architecture/adr/ADR-0025-infrastructure-provisioning-and-vercel-deployment-automation.md`](./docs/architecture/adr/ADR-0025-infrastructure-provisioning-and-vercel-deployment-automation.md)

### Auth dependency note

`@neondatabase/auth` is currently a beta package. We pin the version and treat
it as intentional: access is allowlisted, auth flows are covered by tests, and
we monitor upstream releases before upgrading.

## Documentation

- Start here: [`docs/README.md`](./docs/README.md)
- Product requirements: [`PRD.md`](./PRD.md)
- Architecture overview: [`docs/architecture/overview.md`](./docs/architecture/overview.md)
- Agent/contribution standards: [`AGENTS.md`](./AGENTS.md)

## Local development

### Prerequisites

- Bun v1.2+ (uses `bun.lock`)
- A Neon database URL in `DATABASE_URL`
- Neon Auth configured for this project:
  - Enable Neon Auth in the Neon Console and configure OAuth providers (GitHub, Vercel)
  - `NEON_AUTH_BASE_URL`
  - `NEON_AUTH_COOKIE_SECRET` (32+ chars; generate with `openssl rand -base64 32`)
  - `AUTH_ALLOWED_EMAILS` (when `AUTH_ACCESS_MODE=restricted`)
- Upstash credentials (Redis/Vector/QStash)
- Vercel AI Gateway API key (`AI_GATEWAY_API_KEY`)

### Setup

```bash
cp .env.example .env.local
bun install
bun run dev
```

Optional: implementation/deploy automation variables (GitHub/Vercel/Neon/Upstash)
are documented in [`docs/ops/env.md`](./docs/ops/env.md).

## Fetch AI Gateway model catalog

The AI Gateway exposes an OpenAI-compatible models endpoint:
`GET https://ai-gateway.vercel.sh/v1/models`

```bash
AI_GATEWAY_API_KEY=... bun run fetch:models
```

## CI and quality gates

Run the same checks as CI:

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```

## Releases and versioning

This repo uses Release Please and Conventional Commits.

While `version < 1.0.0`, breaking changes bump **minor** and features bump
**patch** (to avoid major releases during active development).

## How to cite

This repo includes a `CITATION.cff`. GitHub will surface a “Cite this repository”
entry when the file is present.

## Security

- CodeQL and OpenSSF Scorecard run in GitHub Actions.
- Dependency Review runs on PRs.
- Dependabot is configured for Bun lockfiles (`bun.lock`).
