---
spec: SPEC-0008
title: Artifact generation, versioning, and export zip
version: 0.3.0
date: 2026-02-01
owners: ["Bjorn Melin"]
status: Proposed
related_requirements: ["FR-014", "FR-015", "FR-017", "FR-034", "NFR-005", "NFR-015"]
related_adrs: ["ADR-0006", "ADR-0013", "ADR-0024"]
notes: "Defines artifact kinds, versioning, and deterministic export (including implementation audit bundles)."
---

## Summary

Defines artifact generation formats, versioning, and deterministic export
packaging.

## Context

The primary output of the system is a set of formal docs (PRD, ADRs, SPECS,
roadmap, prompts) plus, for Implementation Runs, a complete audit trail of what
happened (plan, patches, verification, provisioning, deployment).

Users need deterministic export to share, archive, or attach provenance to a PR.

## Goals / Non-goals

### Goals

- Define artifact kinds and storage
- Monotonic versioning per artifact key
- Deterministic zip export ordering
- Deterministic export includes the Implementation Audit Bundle when present

### Non-goals

- Collaborative editing of artifacts in-app (future)

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-014:** Generate and version artifacts (PRD, ARCHITECTURE, SECURITY, ADRs,
  ROADMAP, prompts).
- **FR-015:** Render artifacts in UI as streaming Markdown (supports partial
  markdown).
- **FR-017:** Export deterministic zip of latest artifacts + citations.
- **FR-034:** Generate an implementation audit bundle: deterministic export of
  plan, patches, logs, infra metadata, and deployment provenance.

### Non-functional requirements

- **NFR-005 (Determinism):** Export is deterministic: latest artifact versions,
  stable ordering.
- **NFR-015 (Auditability):** Side-effectful actions and outputs are logged with
  intent and external IDs.

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- **IR-002:** Relational store is Neon Postgres.
- **IR-005:** Vector search via Upstash Vector (prefer HYBRID indexes when
  provisioning).

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

### Artifact kinds (minimum)

Research/spec artifacts:

- `PRD`
- `ARCHITECTURE_OVERVIEW`
- `SECURITY_MODEL`
- `ROADMAP`
- `ADR_*` and `SPEC_*` (stored as Markdown with frontmatter)
- `CODEX_PROMPTS` (if maintained as a generated artifact)

Implementation artifacts:

- `IMPLEMENTATION_PLAN` (machine-readable JSON)
- `PATCHSET` (commit SHAs + diff manifest)
- `VERIFICATION_REPORT` (structured results for lint/typecheck/test/build)
- `DEPLOYMENT_PROVENANCE` (deployment IDs/URLs + commit SHA)
- `IMPLEMENTATION_AUDIT_BUNDLE` (deterministic bundle manifest referencing all of
  the above)

### Data contracts (if applicable)

- Artifact record (conceptual):
  - `projectId`, `kind`, `version`, `contentMd`, `citationsJson`, `createdAt`
- Export manifest (conceptual):
  - stable ordered list of exported files with `sha256` and provenance metadata

### File-level contracts

- `src/app/api/export/[projectId]/route.ts`: loads latest artifact versions, builds deterministic manifest, streams zip.
- `src/lib/artifacts/*`: canonical artifact versioning and storage helpers.
- `src/lib/export/zip.ts`: deterministic zip builder (stable order + timestamps).

### Configuration

- See `docs/ops/env.md`:
  - DB: `DATABASE_URL`
  - Blob (if exporting originals too): `BLOB_READ_WRITE_TOKEN`
  - Upstash Vector (for retrieval indexing of artifacts): `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`

## Acceptance criteria

- Export zip contains latest artifacts with stable ordering
- Re-export without changes produces identical zip hash

## Testing

- Unit: deterministic zip ordering
- Integration: export for a small project matches expected manifest

## Operational notes

- Store export manifest in DB for audit

## Failure modes and mitigation

- Missing artifact → fail export with an explicit error and remediation steps.
  Deterministic export must never silently fabricate content.

## Key files

- `src/app/api/export/[projectId]/route.ts`
- `src/lib/export/zip.ts`

## References

- [ctx-zip](https://ai-sdk.dev/tools-registry/ctx-zip)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
