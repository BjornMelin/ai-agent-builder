---
ADR: 0027
Title: Preview resource governance for bot branches (Vercel + Neon)
Status: Implemented
Version: 0.1
Date: 2026-02-06
Supersedes: []
Superseded-by: []
Related: [ADR-0018, ADR-0025]
Tags: [architecture, ci-cd, vercel, neon, dependabot, renovate]
References:
  - [Vercel git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration)
  - [Vercel project configuration (`ignoreCommand`)](https://vercel.com/docs/project-configuration)
  - [Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration)
  - [Neon Vercel-managed integration](https://neon.com/docs/guides/vercel-managed-integration)
  - [GitHub Actions conditional execution](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
---

## Status

Implemented — 2026-02-06.

## Context

Dependabot/Renovate PR branches can trigger preview-side effects across multiple
systems:

- Vercel preview deployments
- branch-scoped preview environment variables
- Neon preview branches via Vercel integration

This repo requires human preview environments for normal product development, so
global preview disablement is too coarse.

## Decision Drivers

- Prevent bot-triggered preview resource creation and drift.
- Preserve preview behavior for human-authored branches.
- Keep controls reviewable and auditable.
- Keep operational complexity bounded and explicit.

## Alternatives Considered

### A. Vercel-only branch suppression (`git.deploymentEnabled`)

Pros:

- Simple and platform-native.
- High leverage.

Cons:

- No governance for workflow-level side effects or drift detection.

### B. Workflow-only gating

Pros:

- Localized to GitHub Actions.

Cons:

- Incomplete if platform-level deployment triggers remain enabled.

### C. Constrained defense-in-depth (chosen)

Controls:

1. Vercel branch suppression (`git.deploymentEnabled`)
2. Vercel `ignoreCommand` fallback guard
3. Workflow actor/branch guards for preview-related jobs
4. Scheduled drift audit and remediation for bot resource leftovers

Pros:

- Covers platform + workflow + drift domains.
- Preserves human preview flows.
- Strong auditability.

Cons:

- More moving parts than single-control option.

### D. Disable all preview deployments globally

Pros:

- Maximal suppression.

Cons:

- Breaks required preview workflow for humans.

## Decision Framework Scoring

Weights:

- Solution leverage: 35%
- Application value: 30%
- Maintenance and cognitive load: 25%
- Architectural adaptability: 10%

| Option | Leverage | Value | Maintenance | Adaptability | Weighted total |
| --- | ---: | ---: | ---: | ---: | ---: |
| A. Vercel-only branch suppression | 9.5 | 9.1 | 9.6 | 8.6 | **9.29** |
| B. Workflow-only gating | 7.6 | 8.1 | 8.0 | 8.4 | 7.96 |
| C. Constrained defense-in-depth | 9.3 | 9.4 | 8.8 | 9.1 | **9.17** |
| D. Disable all previews globally | 9.0 | 3.2 | 9.7 | 4.8 | 6.99 |

Consensus process artifacts used in evaluation:

- Exa deep research task: `01kgs1dc7rjrgscr61qhz5agne`
- Zen consensus continuation: `01cd787b-0907-4697-9530-3ededd8c6308`

## Decision

Adopt **Option C (constrained defense-in-depth)**, with Option A as its mandatory
base layer.

Why this choice:

- Option A alone scores highly and is retained.
- Option C adds minimal but material safeguards against workflow drift and stale
  resources.
- Both selected decisions are above the 9.0 threshold.

## Implementation

- `vercel.json`:
  - branch suppression for `dependabot/**`, `renovate/**`
  - `ignoreCommand` set to `scripts/vercel-ignore-build.sh`
- Bot branch/actor guards in:
  - `.github/workflows/vercel-preview-env-sync.yml`
  - `.github/workflows/vercel-preview-env-cleanup.yml`
  - `.github/workflows/neon-auth-trusted-domains.yml`
- Drift governance:
  - `.github/workflows/preview-bot-resource-drift-audit.yml`

## Consequences

### Positive

- Reduced unwanted preview resource creation and spend.
- Better operational confidence through periodic drift audits.
- No regression for human preview workflows.

### Trade-offs

- Added workflow logic to maintain.
- Scheduled audit can fail noisily when integrations are misconfigured.

## Verification

- Run drift audit manually (`workflow_dispatch`) in both modes:
  - `audit-only`
  - `audit-and-cleanup`
- Validate with CLI checks:
  - `vercel env list preview <branch>`
  - `neon branches list --project-id <id> --output json`
