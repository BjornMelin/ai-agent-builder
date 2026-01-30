# Product Requirements Document (PRD) — ai-agent-builder

Version: 0.1.0  
Date: 2026-01-30  
Owner: you

## Executive summary

ai-agent-builder is a single-user system for turning rough product inputs (docs,
decks, spreadsheets, notes) into an implementation-ready documentation pack:
market research, competitive analysis, differentiation, PRD, architecture,
ADRs/SPECs, security notes, roadmap, and Codex-ready implementation prompts.

The product is optimized for:

- fast iteration by one builder
- auditable research (citations)
- durable workflows that continue after disconnects
- deterministic exports for handoff/versioning

## Problem statement

Building a new product requires repetitive, high-context work: collecting source
materials, researching competitors, validating assumptions, and converting
findings into a coherent spec set. This work is time-consuming and brittle:
outputs drift, sources get lost, and it is hard to go from “idea” to “ship-ready
plan” without redoing analysis.

## Goals and non-goals

### Goals

- Provide a single workspace per project for uploads, notes, chats, and runs.
- Generate a complete documentation pack with strict structure and versioning.
- Ensure research outputs are current and cite sources.
- Keep workflows durable and idempotent so a run can complete without the UI.
- Make export deterministic so artifacts can be committed or shared reliably.

### Non-goals

- Multi-tenant accounts, orgs, billing, or collaboration features.
- A generic “agent framework” for third parties (this is an end-user product).
- Long-running compute jobs beyond bounded research/spec generation workflows.

## Target users / personas

- Solo builder (primary): wants high-quality, consistent product docs quickly.
- Technical founder: wants research-backed decisions and a concrete build plan.
- Staff/lead engineer (secondary): wants coherent specs/ADRs for implementation.

## User journeys (happy paths)

### Journey A: From uploads to a full documentation pack

1. User logs in (single password).
2. User creates a project.
3. User uploads files (PDF/DOCX/PPTX/XLSX/TXT/MD).
4. System extracts text and structure, chunks content, and indexes it for
   retrieval.
5. User chats with the project knowledge base (streaming responses).
6. User starts a durable run that performs research and generates artifacts
   (PRD/specs/ADRs/security/roadmap/prompts).
7. User exports the latest artifacts and citations as a deterministic zip.

### Journey B: Iterate on an existing project

1. User uploads additional material and/or adds instructions in chat.
2. User regenerates or refines a subset of artifacts.
3. System versions artifacts and updates export output deterministically.

## Scope and requirements

The canonical requirement catalog lives in `docs/specs/requirements.md`. This
PRD describes product-level scope and maps to requirements/specs for
implementation.

### Epic 1: Authentication and access control

- Single-user password login with secure session cookie. (FR-001, NFR-001, NFR-002)
- Protect all sensitive routes and keep provider keys server-only. (NFR-001)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0002-authentication-access-control.md`
- `docs/architecture/adr/ADR-0002-authentication-single-password-signed-cookie-session.md`

### Epic 2: Projects and workspace

- Project CRUD with archive/delete semantics. (FR-002, NFR-007)
- Keep all artifacts, runs, and knowledge scoped to a project. (FR-019)

Primary spec/ADR references:

- `docs/architecture/data-model.md`

### Epic 3: Uploads and ingestion

- Upload supported file types and persist originals. (FR-003, FR-004, IR-006)
- Extract text + structure and chunk deterministically. (FR-005, FR-006)
- Generate embeddings and index in vector store. (FR-007, IR-001, IR-005)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0003-upload-ingestion-pipeline.md`
- `docs/architecture/adr/ADR-0009-file-storage-vercel-blob-for-uploads-originals.md`
- `docs/architecture/adr/ADR-0004-retrieval-upstash-vector-for-semantic-search.md`

### Epic 4: Chat with retrieval augmentation

- Project-scoped chat with streaming UI. (FR-008, PR-001)
- Retrieval-augmented responses using project KB. (FR-019)
- Agent mode selection per chat. (FR-009)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0004-chat-retrieval-augmentation.md`
- `docs/architecture/adr/ADR-0006-agent-runtime-ai-sdk-v6-toolloopagent-streaming-ui-responses.md`

### Epic 5: Durable runs (research → artifacts)

- Start and persist durable runs with step status and tool call logs. (FR-010, FR-011)
- Runs complete despite client disconnects; steps are idempotent. (PR-004, PR-005)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0005-durable-runs-orchestration.md`
- `docs/architecture/adr/ADR-0005-orchestration-upstash-qstash-for-durable-workflows.md`

### Epic 6: Web research with citations

- Perform web research (search + extraction) with citations. (FR-012, IR-007)
- Cache results and enforce budgets to control cost. (NFR-006)
- Store citations for UI rendering and exports. (NFR-004, FR-011)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0007-web-research-citations-framework.md`
- `docs/architecture/adr/ADR-0008-web-research-exa-firecrawl-with-citations.md`

### Epic 7: Artifact generation, versioning, and export

- Generate a documentation pack (PRD, ADRs, specs, security, roadmap, prompts). (FR-014)
- Render artifacts as streaming Markdown. (FR-015)
- Support refine/regenerate flows. (FR-016)
- Export latest artifacts + citations deterministically as zip. (FR-017, NFR-005)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md`

### Epic 8: Safe “Code Mode” execution

- Execute bounded analysis tasks in isolated sandbox VMs. (FR-018, IR-009)
- Ensure secrets are not exposed and execution is allowlisted. (NFR-001)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0009-sandbox-code-mode.md`
- `docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md`

### Epic 9: Observability, budgets, and cost controls

- Persist telemetry (latency, token usage, tool calls, errors). (NFR-004, FR-011)
- Enforce budgets and rate limits server-side. (NFR-006, IR-003)

Primary spec/ADR references:

- `docs/architecture/spec/SPEC-0010-observability-budgets-and-cost-controls.md`
- `docs/architecture/adr/ADR-0013-caching-cost-controls-next-js-caching-upstash-redis-budgets.md`

## Non-functional requirements (product-level)

The system must be:

- Secure by default; no client exposure of provider keys. (NFR-001)
- Single-user by design. (NFR-002)
- Maintainable with strict TypeScript + modular boundaries. (NFR-003)
- Observable with persisted, queryable telemetry. (NFR-004)
- Deterministic for exports and artifact version selection. (NFR-005)
- Cost-controlled with caching, budgets, and rate limiting. (NFR-006)
- Accessible (keyboard + screen reader). (NFR-008)
- Protected by CI quality gates and supply-chain automation. (NFR-009, NFR-010)

## Integrations and dependencies

Required external services (see also IR-* requirements):

- Vercel (hosting + functions runtime + blob + sandbox)
- Vercel AI Gateway (models + embeddings routing)
- Neon Postgres (relational store)
- Upstash Redis + Ratelimit (cache + budgets)
- Upstash Vector (vector retrieval)
- Upstash QStash (durable orchestration)
- Exa + Firecrawl (web research search + extraction)
- MCP (Context7) for up-to-date library documentation queries

## Success metrics

Primary metrics:

- Time to first streamed chat token (p95) and run artifact streaming start.
- Median time from “new project” → “exportable docs pack”.
- Percent of research sections with citations attached.
- Run success rate and retry/repair rate.

Guardrail metrics:

- Cost per run (tokens + web calls) under configured budgets.
- Cache hit rate for web extraction and retrieval.
- Error budget consumption and incident frequency.

## Release and rollout

- Pre-1.0 development with Release Please + Conventional Commits.
- Ship in small vertical slices (end-to-end flow) rather than isolated modules.
- Maintain backwards-compatibility only when required by existing data.

## Risks and mitigations

- Research correctness drift: enforce citations and clearly separate “fact” vs “inference”.
- Cost blowups: budgets, caching, and hard caps on tool calls/URLs.
- Provider instability: retries, fallbacks, and durable orchestration.
- Data deletion complexity: ensure deletes cascade across DB/vector/blob refs.

## Open questions

- Artifact schema: what is the minimal stored representation vs rendered Markdown?
- How strict should “deterministic export” be for timestamps and ordering?
- What is the initial agent mode set shipped in v0.1?
- What are the default budgets for web calls, tokens, and step counts?

## References

- Requirements: `docs/specs/requirements.md`
- Architecture overview: `docs/architecture/overview.md`
- ADR index: `docs/architecture/adr/index.md`
- SPEC index: `docs/architecture/spec/index.md`

