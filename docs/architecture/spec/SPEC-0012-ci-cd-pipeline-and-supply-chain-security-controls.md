---
spec: SPEC-0012
title: CI/CD pipeline and supply chain security controls
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["NFR-009", "NFR-010", "PR-006", "IR-010"]
related_adrs: ["ADR-0018", "ADR-0017"]
notes: "Documents CI workflow and security scanning as required architecture."
---

## Summary

Defines required CI jobs and security workflows to keep repo safe and maintainable.

## Context

The repo is already configured with CI and security workflows. This spec sets expectations and acceptance criteria.

## Goals / Non-goals

### Goals

- Ensure every PR runs core quality gates
- Maintain continuous code scanning and dependency governance
- Keep workflow noise manageable with grouping and stability

### Non-goals

- Paid security tooling

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- None

### Non-functional requirements

- **NFR-009 (Supply chain):** Automated scanning and dependency governance
  (Dependabot, Dependency Review, CodeQL, Scorecard).
- **NFR-010 (Quality gates):** CI enforces format/lint/typecheck/test/build with
  Bun-only commands.

### Performance / Reliability requirements (if applicable)

- **PR-006:** CI completes within 10 minutes for typical PRs (p95).

### Integration requirements (if applicable)

- **IR-010:** Bun toolchain: installs/scripts/CI use Bun and Vercel Functions run
  on Bun runtime where supported.

## Constraints

- All workflows must run under GitHub-hosted runners
- Workflow changes require review

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.0 | 2.70 |
| Maintenance & cognitive load | 0.25 | 9.1 | 2.27 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.10 / 10.0

## Design

### Architecture overview

- `ci.yml`: lint, typecheck, test, build.
- `codeql.yml`: code scanning.
- `dependency-review.yml`: dependency diff scanning on PR.
- `scorecard.yml`: supply-chain posture.
- `dependabot.yml`: automated updates (Bun ecosystem).

### Data contracts (if applicable)

- Not applicable. CI workflows and scanners produce logs and checks, but this
  spec does not define new app-facing APIs or persisted data formats.

### File-level contracts

- `.github/workflows/ci.yml`: runs `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`.
- `.github/workflows/codeql.yml`: code scanning configuration.
- `.github/workflows/dependency-review.yml`: PR dependency diff scanning.
- `.github/workflows/scorecard.yml`: supply-chain posture checks.
- `.github/dependabot.yml`: update cadence and grouping.

### Configuration

- CI scripts are defined in `package.json` and must remain Bun-only.
- Scanner configurations live under `.github/workflows/*` and are reviewed like code.

## Acceptance criteria

- CI jobs pass on a clean branch
- Dependabot PRs are grouped and weekly
- CodeQL and Scorecard workflows run on schedule

## Testing

- Manual: open a PR and confirm workflows trigger

## Operational notes

- Triage alerts and keep dependencies updated

## Failure modes and mitigation

- Excess Dependabot noise → tighten grouping or schedule
- False positive in scanning → document exception and keep minimal

## Key files

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/scorecard.yml`
- `.github/dependabot.yml`

## References

- [CodeQL](https://docs.github.com/en/code-security/code-scanning)
- [Dependency review](https://docs.github.com/en/code-security/supply-chain-security)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
