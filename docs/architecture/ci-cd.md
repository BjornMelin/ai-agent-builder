# CI/CD and Supply Chain Security

This repository is intentionally configured with strong default security and
quality gates from day 1.

## CI pipeline (required)

The baseline CI workflow is `.github/workflows/ci.yml`:

- Lint (Biome + ESLint)
- Typecheck (tsc + `next typegen`)
- Test (Vitest + typecheck enabled)
- Build (Next.js)

All steps run using Bun.

## Security workflows

These workflows provide supply-chain and code-scanning coverage:

- Dependency Review (PRs): `.github/workflows/dependency-review.yml`
- CodeQL: `.github/workflows/codeql.yml`
- OpenSSF Scorecard: `.github/workflows/scorecard.yml`
- Dependabot: `.github/dependabot.yml` (Bun ecosystem)

## Release automation

Release Please manages semver and changelog updates:

- `.github/workflows/release-please.yml`
- `release-please-config.json`
- `.release-please-manifest.json`

Policy:

- Conventional Commits required for PR titles/merge commits.
- Pre-1.0 bump strategy is configured in release-please.

## Required CI invariants

- CI must run `bun install --frozen-lockfile` (deterministic installs).
- `bun run ci` must succeed on every PR.
- No hidden “it works on my machine” build steps.
