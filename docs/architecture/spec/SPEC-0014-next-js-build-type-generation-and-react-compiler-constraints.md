---
spec: SPEC-0014
title: Next.js build, type generation, and React Compiler constraints
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["NFR-011", "NFR-010", "PR-006"]
related_adrs: ["ADR-0020"]
notes: "Documents Next.js config invariants: reactCompiler, turbopack, and typegen scripts."
---

## Summary

Defines required Next.js build configuration and CI typing gates for this repo.

## Context

The bootstrapped repo enables React Compiler and uses `next typegen` in scripts. This spec prevents future drift.

## Goals / Non-goals

### Goals

- Keep React Compiler enabled and avoid manual memoization
- Keep Turbopack configuration aligned with Next 16
- Ensure typegen runs before typecheck and tests

### Non-goals

- Custom webpack configurations unless necessary

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

### Non-functional requirements

- **NFR-011**
- **NFR-010**

### Performance / Reliability requirements (if applicable)

- **PR-006**

### Integration requirements (if applicable)

- **IR-010**

## Constraints

- Do not add `useMemo`/`useCallback` without documented exception
- Do not remove typegen from CI scripts

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

- `next.config.ts`: `reactCompiler: true`, Turbopack root configured.
- `package.json`: `typecheck` and `test` run `bun --bun next typegen`.

### File-level contracts

- `next.config.ts`
- `package.json` scripts: `typegen`, `typecheck`, `test`

## Acceptance criteria

- `bun run build` succeeds
- `bun run typecheck` runs typegen and tsc with strict config
- `bun run test` runs typegen and vitest

## Testing

- CI pipeline ensures these commands run on every PR

## Operational notes

- If Turbopack issues arise, document fallback strategy

## Failure modes and mitigation

- Typegen missing → typecheck fails → ensure scripts remain unchanged

## Key files

- `next.config.ts`
- `package.json`
- `.github/workflows/ci.yml`

## References

- [React Compiler](https://react.dev/learn/react-compiler)
- [Next.js config](https://nextjs.org/docs/app/api-reference/next-config-js)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
