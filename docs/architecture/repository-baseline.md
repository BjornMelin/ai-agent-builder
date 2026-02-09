# Repository Baseline (Bootstrapped State)

This document maps the **current** repository files to the architecture plan,
so ADRs and SPECs remain grounded as the system is implemented.

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

## Gaps between baseline and target system

The repo is intentionally bootstrapped: it includes core conventions, tooling,
and some foundational modules, but does **not** yet include the full target
system described in [docs/architecture/spec/index.md](./spec/index.md) and
[docs/architecture/adr/index.md](./adr/index.md).

Major gaps that remain:

- **Repo indexing (FR-032)** is implemented as a bounded, cost-guardrailed indexer
  that reads tracked files from a sandbox checkout and upserts code chunks into
  Upstash Vector under `project:{projectId}:repo:{repoId}`.
  See [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md).
- **Implementation audit bundle export (FR-034)** is implemented as a deterministic ZIP
  uploaded to Vercel Blob and referenced by an artifact row. Project-wide deterministic
  export remains available for latest artifacts + citations (`GET /api/export/:projectId`).
  See [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md) and
  [SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md).
- Full artifact regeneration workflows remain partial; deterministic export endpoint is implemented (`GET /api/export/:projectId`).
- Provider webhooks exist (GitHub/Vercel), but polling remains the default for external state.

These are intentional: the repository is bootstrapped to keep initial complexity
low, while the docs define the full production target.
