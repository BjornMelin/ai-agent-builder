---
spec: SPEC-0013
title: Release management and versioning
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["NFR-010"]
related_adrs: ["ADR-0019"]
notes: "Defines release and changelog automation."
---

## Summary

Defines how releases are created, versioned, and documented.

## Context

Release Please already exists in the repo; this spec defines the policy so the repo remains consistent over time.

## Goals / Non-goals

### Goals

- Automate versioning and changelog updates
- Enforce Conventional Commits
- Support pre-1.0 version bump strategy

### Non-goals

- Manual tagging and changelog editing

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- None

### Non-functional requirements

- **NFR-010 (Quality gates):** CI enforces format/lint/typecheck/test/build with
  Bun-only commands.

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- None

## Constraints

- Releases only from main
- CI must pass before release PR merge

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.1 | 3.18 |
| Application value | 0.30 | 9.0 | 2.70 |
| Maintenance & cognitive load | 0.25 | 9.2 | 2.30 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.09 / 10.0

## Design

### Architecture overview

- Release Please runs on pushes to `main`.
- It opens a release PR that updates version and `CHANGELOG.md`.
- Merging the PR creates a GitHub release.

### Data contracts (if applicable)

- Not applicable. This spec defines repository release automation; it does not
  add runtime APIs or application data formats.

### File-level contracts

- `release-please-config.json`: bump strategy and changelog path
- `.release-please-manifest.json`: current version
- `CHANGELOG.md`: canonical history

### Configuration

- GitHub workflow: `.github/workflows/release-please.yml` (trigger + permissions).
- Release Please config: `release-please-config.json` + `.release-please-manifest.json`.

## Acceptance criteria

- Release Please opens a release PR after changes on main
- CHANGELOG is updated automatically

## Testing

- Manual: simulate release with a conventional commit and observe PR creation

## Operational notes

- Review release PR before merge

## Failure modes and mitigation

- Non-conventional commits → release automation stalls → enforce via PR rules

## Key files

- `.github/workflows/release-please.yml`
- `release-please-config.json`
- `CHANGELOG.md`

## References

- [Release Please](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
