---
spec: SPEC-0001
title: System scope, terminology, and requirements mapping
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-001", "FR-020", "NFR-011"]
related_adrs: ["ADR-0001"]
notes: "Defines system scope, glossary, and how requirements map to specs."
---

## Summary

Defines the overall system scope, vocabulary, and how requirements are organized.

## Context

The repo is bootstrapped with core tooling but does not yet include all runtime modules. This spec establishes the target system boundaries and the canonical requirements catalog.

## Goals / Non-goals

### Goals

- Define scope and terminology for the entire system
- Provide a stable requirement ID catalog used across specs/ADRs
- Anchor file-level contracts to the `src/` repo layout

### Non-goals

- Implementing features (this is documentation-only)
- Supporting multi-tenant user accounts

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-001**
- **FR-002**
- **FR-003**
- **FR-004**
- **FR-005**
- **FR-006**
- **FR-007**
- **FR-008**
- **FR-009**
- **FR-010**
- **FR-011**
- **FR-012**
- **FR-013**
- **FR-014**
- **FR-015**
- **FR-016**
- **FR-017**
- **FR-018**
- **FR-019**
- **FR-020**

### Non-functional requirements

- **NFR-001**
- **NFR-002**
- **NFR-003**
- **NFR-004**
- **NFR-005**
- **NFR-006**
- **NFR-007**
- **NFR-008**
- **NFR-009**
- **NFR-010**
- **NFR-011**

### Performance / Reliability requirements (if applicable)

- **PR-001**
- **PR-002**
- **PR-003**
- **PR-004**
- **PR-005**
- **PR-006**

### Integration requirements (if applicable)

- **IR-001**
- **IR-002**
- **IR-003**
- **IR-004**
- **IR-005**
- **IR-006**
- **IR-007**
- **IR-008**
- **IR-009**
- **IR-010**

## Constraints

- Single-user operation (no user tables required)
- Server-only secrets and tool execution
- Bun-only scripts and installs

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.1 | 2.73 |
| Maintenance & cognitive load | 0.25 | 9.3 | 2.33 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.18 / 10.0

## Design

### Architecture overview

This system is built as a single Next.js App Router app under `src/app` with domain modules under `src/lib` and Drizzle schema under `src/db`.

### File-level contracts

- `docs/specs/requirements.md`: canonical requirement IDs
- `docs/architecture/adr/*`: immutable decisions
- `docs/architecture/spec/*`: implementation specs

## Acceptance criteria

- All specs reference requirement IDs in `docs/specs/requirements.md`
- All ADRs have decision scores >= 9.0 and current-date updates
- Repository paths referenced use `src/` layout

## Testing

- Documentation lint (optional): ensure internal links resolve
- Manual review: verify path references match repo baseline

## Operational notes

- Update this spec when adding a new major system capability

## Failure modes and mitigation

- Spec drift (docs don't match repo) → update `repository-baseline.md` and affected files

## Key files

- `docs/specs/requirements.md`
- `docs/architecture/overview.md`
- `docs/architecture/repository-baseline.md`

## References

- [AI SDK](https://ai-sdk.dev/docs/introduction)
- [Next.js App Router](https://nextjs.org/docs/app)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
