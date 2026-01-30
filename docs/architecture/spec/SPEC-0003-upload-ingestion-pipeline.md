---
spec: SPEC-0003
title: Upload + ingestion pipeline
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-003", "FR-004", "FR-005", "FR-006", "FR-007", "PR-003", "IR-006", "IR-005", "IR-001"]
related_adrs: ["ADR-0009", "ADR-0004", "ADR-0007"]
notes: "Defines storage, extraction, chunking, embedding, and indexing pipeline."
---

## Summary

Defines how uploaded files are stored, extracted, chunked, embedded, and indexed for retrieval.

## Context

Users upload pitch decks, PDFs, docs, and spreadsheets. The system must preserve originals, extract text reliably, and build a vector index to support grounded reasoning.

## Goals / Non-goals

### Goals

- Durably store originals in Blob
- Extract text with structural metadata
- Chunk with stable rules and content hashes
- Embed via AI Gateway and index in Upstash Vector

### Non-goals

- Real-time collaborative editing of uploaded docs
- Automatic OCR for scanned docs by default (only when needed)

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-003**
- **FR-004**
- **FR-005**
- **FR-006**
- **FR-007**

### Non-functional requirements

- **NFR-005**
- **NFR-007**

### Performance / Reliability requirements (if applicable)

- **PR-003**

### Integration requirements (if applicable)

- **IR-006**
- **IR-005**
- **IR-001**

## Constraints

- Reject unsupported file types
- Enforce max upload size
- Compute sha256 for idempotency

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.4 | 2.82 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.20 / 10.0

## Design

### Architecture overview

- Upload route stores file in Blob and writes metadata in Neon.
- Extraction pipeline produces a normalized document model.
- Chunker splits text into stable segments with source refs.
- Embeddings generated via AI Gateway and stored in Upstash Vector.

### Data contracts

- `ExtractedDoc`: `{fileId, kind, sections:[{ref,text,meta}]}`
- `Chunk`: `{id, projectId, fileId, ref, text, sha256, tokensEstimate}`

### File-level contracts

- `src/app/api/upload/route.ts`
- `src/lib/ingest/extract/*`
- `src/lib/ingest/chunk/*`
- `src/lib/ai/embeddings.ts`
- `src/lib/upstash/vector.ts`

## Acceptance criteria

- Uploading a supported file creates a DB record and Blob object
- Chunks are created deterministically from same input file
- Vector queries return relevant chunks for grounding

## Testing

- Unit: chunking determinism and hashing
- Integration: upload → extract → index → query

## Operational notes

- Background large-file ingestion via QStash
- Re-ingest when extraction version changes

## Failure modes and mitigation

- Extraction fails → mark file as failed and allow retry with logs
- Embedding fails → retry with backoff; persist partial progress

## Key files

- `src/app/api/upload/route.ts`
- `src/lib/ingest/extract`
- `src/lib/ingest/chunk`
- `src/lib/upstash/vector.ts`

## References

- [Vercel Blob](https://vercel.com/docs/vercel-blob)
- [Upstash Vector](https://upstash.com/docs/vector)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
