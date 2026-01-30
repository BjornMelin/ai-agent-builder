---
spec: SPEC-0011
title: Bun toolchain, scripts, and CI/CD
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["NFR-010", "IR-010", "PR-006"]
related_adrs: ["ADR-0015"]
notes: "Defines Bun-first local development, CI workflows, and Vercel runtime configuration."
---

## Summary

Defines the Bun-first toolchain for installs, scripts, CI, and Vercel Functions runtime selection.

## Context

The repo is already Bun-first. This spec documents required invariants so later work does not regress to Node+pnpm assumptions.

## Goals / Non-goals

### Goals

- Bun-only installs and scripts
- Deterministic CI installs with frozen lockfile
- Vercel Functions run on Bun runtime where supported

### Non-goals

- Supporting pnpm/yarn/npm as first-class toolchains

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-021**

### Non-functional requirements

- **NFR-010**
- **NFR-011**

### Performance / Reliability requirements (if applicable)

- **PR-006**

### Integration requirements (if applicable)

- **IR-010**

## Constraints

- Commit Bun lockfile; CI uses `--frozen-lockfile`
- Allowlist lifecycle scripts via `trustedDependencies` only
- Vercel Bun runtime configured via `bunVersion: "1.x"`

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.4 | 3.29 |
| Application value | 0.30 | 9.0 | 2.70 |
| Maintenance & cognitive load | 0.25 | 9.4 | 2.35 |
| Architectural adaptability | 0.10 | 9.0 | 0.90 |

**Total:** 9.24 / 10.0

## Design

### Architecture overview

- Vercel: `vercel.json` sets Bun runtime.
- Local + CI: `bun install` and `bun run ...`.
- Scripts execute Next via `bun --bun next ...`.

### Configuration

- `package.json.engines.bun`: minimum supported Bun version
- `package.json.trustedDependencies`: allowlisted lifecycle scripts

## Acceptance criteria

- All scripts run with Bun
- CI uses deterministic installs
- Vercel deployment uses Bun runtime

## Testing

- CI builds and tests run successfully under Bun

## Operational notes

- Document rollback path if Bun runtime issues occur

## Failure modes and mitigation

- Missing lockfile → CI fails; fix by committing lockfile
- Untrusted lifecycle scripts needed → add to `trustedDependencies` after review

## Key files

- `vercel.json`
- `package.json`
- `.github/actions/ci-setup/action.yml`

## References

- [Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun)
- [Bun lifecycle scripts](https://bun.com/docs/pm/lifecycle)
- [Vercel package managers](https://vercel.com/docs/package-managers)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
