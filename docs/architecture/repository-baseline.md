# Repository Baseline

Current as of 2026-07-16. This document maps the released application to its
architecture records so ADRs and SPECs stay grounded in implementation truth.

## Current directory structure

Key paths present now:

- `src/app/*` — Next.js App Router entrypoints
- `src/lib/*` — foundational runtime modules (env, auth, provider adapters)
- `src/proxy.ts` — Next.js `proxy.ts` based route protection
- `src/db/*` — Drizzle schema + migrations (committed)
- `.github/workflows/*` — CI, CodeQL, dependency review, release-please, scorecard
- `.github/actions/ci-setup` — composite action (Bun setup + install)
- `scripts/fetch-models.sh` — pulls AI Gateway model catalog into `docs/`
- `vercel.json` — Bun runtime selection (`bunVersion: "1.x"`)
- `biome.json`, `eslint.config.js`, `vitest.config.ts` — quality gates
- `AGENTS.md` — agent-first contribution rules and Next docs index

## Toolchain baseline

### Bun

- `package.json` has `engines.bun >= 1.2.0`.
- Scripts execute Next via Bun (`bun --bun next …`).
- CI installs dependencies with `bun install --frozen-lockfile` via GitHub Actions
  `.github/actions/ci-setup`.

Why this matters:

- `--frozen-lockfile` requires committing a Bun lockfile.
- Bun blocks dependency lifecycle scripts unless allowlisted via
  `trustedDependencies`. ([Bun lifecycle scripts](https://bun.com/docs/pm/lifecycle))

### Next.js

- `next.config.ts` enables the React Compiler (`reactCompiler: true`) and
  configures Turbopack.
- Type generation is executed via `next typegen` in scripts (`typecheck`, `test`)
  to ensure `*.d.ts` routes/types exist without a full build.

### CI + security automation

- `.github/workflows/ci.yml` runs lint, typecheck, tests, and build.
- Additional workflows:
  - CodeQL: `.github/workflows/codeql.yml`
  - Dependency Review: `.github/workflows/dependency-review.yml`
  - Scorecard: `.github/workflows/scorecard.yml`
  - Release Please: `.github/workflows/release-please.yml`
- GitHub Dependabot is configured for the Bun ecosystem: `.github/dependabot.yml`.

## Implemented product baseline

The repository is a released AI SDK 7 application, not a scaffold. Its current
product surface includes:

- project workspaces with exact-owner edit/archive/restore, active-work leases,
  durable client-upload grants, and an irreversible, retry-safe deletion fence
- project-scoped uploads, ingestion, retrieval, search, chat, and skills
- durable research and implementation runs with approvals and streaming
- Code Mode and Vercel Sandbox execution with persisted provenance
- connected-repository indexing and RepoOps workflows
- deterministic project and implementation audit-bundle exports
- infrastructure/deployment records, webhook handlers, and preview governance

Detailed contracts and completion evidence remain in
[the specification index](./spec/index.md). In particular:

- [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md) defines the
  bounded repository indexer and GitHub integration.
- [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
  and [SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md)
  define deterministic implementation and project exports.
- [SPEC-0020](./spec/SPEC-0020-project-workspace-and-search.md) defines project
  lifecycle, workspace, and search behavior.

## Remaining release gates

- Keep public sign-up disabled until metered providers have a deliberate BYOK
  or hosted-metering design (NFR-012).
- Backfill historical `legacy-unowned` projects to a confirmed Neon Auth user,
  verify zero sentinel-owned rows, then remove the compatibility read path.
- Configure Vercel Blob and Upstash Redis/Vector in each environment before
  enabling permanent deletion; the UI intentionally refuses relational-only
  deletion when either cleanup provider is unavailable.
- Run the full project lifecycle browser check against a configured preview
  after database, Blob, Vector, Redis, and test-auth credentials are available:
  create → rename → upload/search → archive/restore → typed deletion. The
  repository does not track local credentials or a `.vercel` binding; never use
  placeholder secrets to present this live preview check as complete. Keep
  deterministic provider-contract and lifecycle-component tests in CI.
- Persist run-level token/cost accounting and expose real consumption rather
  than static budget limits (SPEC-0010).
- Provider webhooks exist, but polling remains the default for external state.
- Rotate the Neon API key used by the scheduled preview-drift audit, then rerun
  audit-only mode before any cleanup mode.

These gates do not justify compatibility shims or simulated success. Keep the
deployment restricted and record missing manual configuration until each gate
is completed and verified.
