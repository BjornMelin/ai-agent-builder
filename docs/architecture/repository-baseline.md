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

- Web research integrations (Exa + Firecrawl) and citations persistence.
- Implementation Run subsystems:
  - RepoOps (GitHub) and PR automation
    ([SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md))
  - sandbox verification jobs
    ([SPEC-0019](./spec/SPEC-0019-sandbox-build-test-and-ci-execution.md))
  - infrastructure provisioning + Vercel deployment automation
    ([SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md))
  - audit bundle export
    ([SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md) +
    [SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md))
- Artifact generation/regeneration and export endpoints (spec’d; see SPEC-0008).
- Webhooks for external status updates (GitHub/Vercel) where polling is insufficient.

These are intentional: the repository is bootstrapped to keep initial complexity
low, while the docs define the full production target.
