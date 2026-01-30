---
spec: SPEC-0008
title: Artifact generation, versioning, and export zip
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-014", "FR-015", "FR-017", "NFR-005"]
related_adrs: ["ADR-0006", "ADR-0013"]
notes: "Defines artifact formats, versioning, and deterministic zip export."
---

## Summary

Defines artifact generation formats, versioning, and deterministic export packaging.

## Context

The primary output of the system is a set of formal docs (PRD, ADRs, SPECS, roadmap, prompts). Users need deterministic export to share or archive results.

## Goals / Non-goals

### Goals

- Define artifact kinds and storage
- Monotonic versioning per artifact key
- Deterministic zip export ordering

### Non-goals

- Collaborative editing of artifacts in-app (future)

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-014**
- **FR-015**
- **FR-017**

### Non-functional requirements

- **NFR-005**

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- **IR-002**
- **IR-005**

## Constraints

- Export includes citations and metadata
- Zip ordering stable across runs

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.1 | 3.18 |
| Application value | 0.30 | 9.4 | 2.82 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.16 / 10.0

## Design

### Architecture overview

- Artifacts stored in Neon with `kind`, `version`, `content_md`, `citations_json`.
- Vector index stores embeddings for artifact retrieval.
- Export route collects latest versions and zips deterministically.

### File-level contracts

- `src/app/api/export/[projectId]/route.ts`
- `src/lib/artifacts/*`
- `src/lib/export/zip.ts`

## Acceptance criteria

- Export zip contains latest artifacts with stable ordering
- Re-export without changes produces identical zip hash

## Testing

- Unit: deterministic zip ordering
- Integration: export for a small project matches expected manifest

## Operational notes

- Store export manifest in DB for audit

## Failure modes and mitigation

- Missing artifact → include placeholder section with warning

## Key files

- `src/app/api/export/[projectId]/route.ts`
- `src/lib/export/zip.ts`

## References

- [ctx-zip](https://ai-sdk.dev/tools-registry/ctx-zip)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
