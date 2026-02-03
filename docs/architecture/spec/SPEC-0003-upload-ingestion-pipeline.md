---
spec: SPEC-0003
title: Upload + ingestion pipeline
version: 0.4.0
date: 2026-02-03
owners: ["you"]
status: Proposed
related_requirements: ["FR-003", "FR-004", "FR-005", "FR-006", "FR-007", "PR-003", "IR-006", "IR-005", "IR-001"]
related_adrs: ["ADR-0009", "ADR-0004", "ADR-0007"]
notes: "Defines storage, extraction, chunking, embedding, and indexing pipeline."
---

## Summary

Defines how uploaded files are stored, extracted, chunked, embedded, and indexed for retrieval.

See [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
for the cross-cutting “finalization” plan that integrates ingestion with
durable runs, retrieval, and the workspace UI.

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

- **FR-003:** Upload files (PDF, DOCX, PPTX, XLSX, TXT/MD) to a project.
- **FR-004:** Store original files durably and associate to a project.
- **FR-005:** Extract text + structural metadata (pages/slides/sheets) from each
  file.
- **FR-006:** Chunk extracted content into retrieval-optimized segments with
  stable rules.
- **FR-007:** Generate embeddings via AI Gateway and index chunks in vector store.

### Non-functional requirements

- **NFR-005 (Determinism):** Export and artifact generation is deterministic
  (stable ordering and latest versions).
- **NFR-007 (Data retention):** Project deletion removes DB records, vector
  entries, and blob refs.

### Performance / Reliability requirements (if applicable)

- **PR-003:** Ingest 10 MB PDF within 2 minutes (p95) excluding queue delay.

### Integration requirements (if applicable)

- **IR-006:** File storage via Vercel Blob.
- **IR-005:** Vector search via Upstash Vector (prefer HYBRID indexes when
  provisioning).
- **IR-001:** All model/embedding calls through Vercel AI Gateway.

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
- Upload route processes independent files in parallel; async ingestion enqueues
  QStash jobs with per-file deduplication ids and labels.
  ([QStash deduplication](https://upstash.com/docs/qstash/features/deduplication),
  [QStash publish API](https://upstash.com/docs/qstash/api-refence/messages/publish-a-message))
- Extraction pipeline produces a normalized document model.
- Chunker splits text into stable segments with source refs.
- Embeddings generated via AI Gateway and stored in Upstash Vector.

### Data contracts

- `ExtractedDoc`: `{fileId, kind, sections:[{ref,text,meta}]}`
- `Chunk`: `{id, projectId, fileId, ref, text, sha256, tokensEstimate}`

### File-level contracts

- `src/app/api/upload/route.ts`: accepts uploads, stores originals, writes DB metadata.
- `src/app/api/jobs/ingest-file/route.ts`: QStash-signed async ingestion worker (optional; used for larger inputs).
- `src/lib/ingest/extract/*`: extraction adapters per file type; must preserve stable refs.
- `src/lib/ingest/chunk/*`: deterministic chunking rules (stable chunk ids).
- `src/lib/ingest/ingest-file.server.ts`: orchestrates extract → chunk → embed → index (idempotent per content hash).
- `src/lib/ai/embeddings.server.ts`: embedding calls via AI Gateway; must be idempotent per hash.
- `src/lib/upstash/vector.server.ts`: upsert/query/delete vectors with project/file metadata.

### Configuration

- See `docs/ops/env.md` for the ingestion pipeline env vars:
  - Blob: `BLOB_READ_WRITE_TOKEN`
  - AI Gateway: `AI_GATEWAY_API_KEY` (optional `AI_GATEWAY_BASE_URL`)
  - Upstash Vector: `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`
  - Optional async ingestion: `QSTASH_TOKEN` (+ verify keys for inbound hooks)

## Acceptance criteria

- Uploading a supported file creates a DB record and Blob object
- Chunks are created deterministically from same input file
- Vector queries return relevant chunks for grounding

## Testing

- Unit: chunking determinism and hashing
- Unit: request-level route handler tests for `/api/upload` and
  `/api/jobs/ingest-file` error handling and async ingestion fallbacks.
- Integration: upload → extract → index → query

## Operational notes

- Background large-file ingestion via QStash
- Re-ingest when extraction version changes

## Failure modes and mitigation

- Extraction fails → mark file as failed and allow retry with logs
- Embedding fails → retry with backoff; persist partial progress

## Key files

- `src/app/api/upload/route.ts`
- `src/app/api/jobs/ingest-file/route.ts`
- `src/lib/ingest/extract`
- `src/lib/ingest/chunk`
- `src/lib/ingest/ingest-file.server.ts`
- `src/lib/upstash/vector.server.ts`

## References

- [Vercel Blob](https://vercel.com/docs/vercel-blob)
- [Upstash Vector](https://upstash.com/docs/vector)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-03)**: Updated file path references to server-only modules and documented the async ingestion worker.
- **0.4 (2026-02-03)**: Documented parallel upload processing, QStash
  deduplication/labels, and route handler test coverage.
