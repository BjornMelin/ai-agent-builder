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

This repo is designed to work with the **Neon ↔ Vercel integration** for Preview
Branching. When enabled, Neon will automatically provision:

- A Neon database branch per Vercel Preview branch (typically named
  `preview/<git-branch>`)
- Branch-scoped Vercel env vars for the Preview deployment (e.g. `DATABASE_URL`,
  and (if Neon Auth is enabled) `NEON_AUTH_BASE_URL`)

This avoids duplicating branch/env provisioning logic in GitHub Actions and
prevents races between push and pull_request workflows.

### Neon Auth trusted domains (optional)

Neon Auth requires explicit allowlisting of trusted domains. Preview URLs can be
added manually in the Neon Console, or automated via a lightweight workflow.

- Workflow: `.github/workflows/neon-auth-trusted-domains.yml`
- What it does:
  - Finds the Neon branch created by the integration (`preview/<git-branch>`).
  - Ensures Neon Auth is enabled for that branch (best-effort; uses the Neon API).
  - Finds the Vercel Preview deployment URL for the PR branch.
  - Adds that Preview domain to Neon Auth trusted domains for that branch
    (idempotent).
  - Never blocks PR merges: on missing integrations/config, it warns and exits 0.

Required repo configuration:

- GitHub Actions variables:
  - `NEON_PROJECT_ID`
- Optional GitHub Actions variable:
  - `ACTIONS_RUNNER_LABELS` (JSON array; defaults to `["ubuntu-latest"]`)
    - Use this only as an operational escape hatch if GitHub-hosted runners are
      unavailable (e.g. GitHub Actions outage) and you have a self-hosted runner.
    - Example: `["self-hosted","linux","x64"]`
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
