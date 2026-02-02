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

## Preview environment automation (optional)

The repo includes a Preview automation workflow to keep Vercel Preview branches
isolated and correctly configured:

- Workflow: `.github/workflows/preview-neon-auth.yml`
- What it does (best-effort):
  - Creates/reuses a Neon branch per PR/branch
  - Ensures Neon Auth is enabled for that branch and captures `NEON_AUTH_BASE_URL`
  - Sets branch-scoped Vercel Preview env vars:
    - `NEON_AUTH_BASE_URL`
    - `DATABASE_URL`
    - `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS=vercel`
  - Adds the Preview deployment domain to Neon Auth trusted domains for that
    branch (once the Preview URL exists)

Required repo configuration:

- GitHub Actions variables:
  - `NEON_PROJECT_ID`
- GitHub Actions secrets:
  - `NEON_API_KEY`
  - `VERCEL_TOKEN`
  - `VERCEL_PROJECT_ID`
  - `VERCEL_TEAM_ID` (optional)

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
