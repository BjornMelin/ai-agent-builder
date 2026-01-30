# Repository Baseline (Bootstrapped State)

This document maps the **current** repository files to the architecture plan,
so ADRs and SPECs remain grounded as the system is implemented.

It is based on the bootstrapped repo snapshot captured in `repomix-output.md`.

## Current directory structure

Key paths present now:

- `src/app/*` — Next.js App Router entrypoints
- `src/db/*` — Drizzle schema + migrations (configured; schema file may be added)
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

The bootstrapped repo snapshot in `repomix-output.md` predates the documentation
pack now committed under `docs/`. The repo still does **not** yet include:

- `src/app/api/*` route handlers for chat/upload/runs
- `src/lib/*` modules for:
  - AI agents and tools
  - ingestion/extraction/chunking
  - DB access layer
  - Upstash adapters
  - auth/session
- dependencies for planned tools and UI libraries:
  - AI Elements, Streamdown
  - Exa, Firecrawl
  - @vercel/blob
  - MCP client packages
  - sandbox tool adapters

These are intentional: the repository is bootstrapped to keep initial complexity
low, while the docs define the full production target.
