---
spec: SPEC-0026
title: Bot-branch preview resource governance (Vercel + Neon)
version: 0.1.0
date: 2026-02-06
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  ["FR-028", "FR-029", "NFR-009", "NFR-010", "NFR-013", "NFR-015", "IR-012", "IR-013"]
related_adrs: ["ADR-0018", "ADR-0025", "ADR-0027"]
related_specs: ["SPEC-0012", "SPEC-0017", "SPEC-0018"]
notes: "Prevents Dependabot/Renovate branches from creating Vercel preview environments or Neon preview branches, while preserving preview workflows for human branches."
---

## Summary

This spec defines and implements a defense-in-depth control set for bot-origin
PR branches (`dependabot/*`, `renovate/*`) so they do not create preview
resources in Vercel/Neon.

Primary outcome:

- No bot-generated preview `APP_BASE_URL` env entries.
- No bot-generated Neon preview branches.
- No unresolved bot preview deployments (detected by scheduled audit).
- No regression for human-authored preview branches.

## Research Basis

- Vercel branch gating with `git.deploymentEnabled` and wildcard branch matching:
  [Vercel git configuration](https://vercel.com/docs/project-configuration/git-configuration)
- Vercel ignored build command behavior (`ignoreCommand`):
  [Vercel project configuration](https://vercel.com/docs/project-configuration)
- Neon managed integration branch lifecycle and obsolete branch cleanup:
  [Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration)
- Neon Vercel-managed integration preview branching behavior:
  [Neon Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration)
- GitHub Actions job conditionals with `github.head_ref`/`startsWith(...)`:
  [GitHub Actions events and conditionals](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

Supporting research artifacts used for decision convergence:

- Exa deep research task: `01kgs1dc7rjrgscr61qhz5agne`
- Zen consensus continuation: `01cd787b-0907-4697-9530-3ededd8c6308`

## Finalized Decisions (All >= 9.0)

Scoring framework:

- Solution leverage: 35%
- Application value: 30%
- Maintenance/cognitive load: 25%
- Architectural adaptability: 10%

| Decision | Leverage | Value | Maintenance | Adaptability | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: |
| D1. Enforce branch-level Vercel deploy suppression for `dependabot/**` and `renovate/**` in `vercel.json` | 9.5 | 9.2 | 9.6 | 8.8 | **9.36** |
| D2. Enforce `ignoreCommand` fallback guard using bot actor/ref checks | 9.0 | 9.2 | 9.0 | 8.6 | **9.02** |
| D3. Guard preview-related GitHub workflows with actor + branch-prefix `if` conditions | 9.2 | 9.3 | 8.9 | 9.0 | **9.12** |
| D4. Run weekly drift audit with auto-cleanup for branch-scoped env vars and Neon branches, and fail on unresolved bot preview deployments | 9.1 | 9.4 | 8.7 | 9.0 | **9.08** |

## Implemented Tasks

### Task group A: Vercel platform guardrails

- Updated `vercel.json` with:
  - `git.deploymentEnabled.dependabot/** = false`
  - `git.deploymentEnabled.renovate/** = false`
  - `ignoreCommand` script hook
- Added `scripts/vercel-ignore-build.sh` to block bot-authored/branch builds.

### Task group B: GitHub workflow guardrails

- Updated `.github/workflows/vercel-preview-env-sync.yml`:
  - job-level skip for bot actors and bot branch prefixes
  - in-script branch guard fallback
- Updated `.github/workflows/vercel-preview-env-cleanup.yml`:
  - job-level skip for bot actors and bot branch prefixes
  - in-script branch guard fallback
- Updated `.github/workflows/neon-auth-trusted-domains.yml`:
  - job-level skip for bot actors and bot branch prefixes
  - in-script branch guard fallback

### Task group C: Drift detection + remediation

- Added `.github/workflows/preview-bot-resource-drift-audit.yml`:
  - weekly schedule + manual dispatch
  - detects bot-scoped preview env vars and Neon preview branches
  - auto-remediates env vars/Neon branches in `audit-and-cleanup` mode
  - detects bot preview deployments and fails when unresolved

## Manual Platform Tasks (Required)

1. In Neon integration settings, enable automatic cleanup of obsolete preview
   branches.
2. Keep Vercel preview deployments enabled for non-bot branches (do **not**
   globally disable preview deployments unless product policy changes).
3. Keep both bot branch patterns standardized across all repos:
   `dependabot/*`, `renovate/*`.

## Verification Plan

### CLI validation (Vercel CLI)

1. Confirm no branch-scoped preview env vars for bot branches:
   - `vercel env list preview dependabot/npm_and_yarn/example`
   - `vercel env list preview renovate/example`
2. Confirm human branch still receives scoped preview env:
   - `vercel env list preview feature/example`

### CLI validation (Neon CLI)

1. Confirm no bot preview branches exist:
   - `neon branches list --project-id "$NEON_PROJECT_ID" --output json | jq -r '.branches[]?.name' | rg '^preview/(dependabot|renovate)/'`
2. Confirm human preview branch behavior remains available when integration is enabled:
   - `neon branches list --project-id "$NEON_PROJECT_ID" --output json | jq -r '.branches[]?.name' | rg '^preview/feature/'`

### Workflow validation

1. Trigger manual drift audit in `audit-only` mode.
2. Confirm workflow exits non-zero if unresolved bot preview resources exist.
3. Re-run in `audit-and-cleanup` mode and confirm unresolved count is zero.

## Acceptance Criteria

- Bot branches do not create branch-scoped preview `APP_BASE_URL` env vars.
- Bot branches do not create persistent Neon preview branches.
- Drift audit workflow reports clean status on steady-state.
- Human-authored preview deployments continue to function.

## Assumptions

- Dependabot/Renovate branch naming remains `dependabot/*` and `renovate/*`.
- Required Vercel/Neon secrets and project IDs are configured in GitHub.
- Neon/Vercel integrations remain enabled for preview branch workflows.
