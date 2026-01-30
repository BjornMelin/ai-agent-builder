# Requirements Catalog

Requirement IDs referenced by SPECs and ADRs.

This catalog is intentionally **repo- and implementation-agnostic**: it defines
behavior and constraints. Specs and ADRs map these IDs to concrete files and
components.

## Functional Requirements

- **FR-001:** Single-user password login with secure session cookie (httpOnly,
  Secure in prod).
- **FR-002:** Project CRUD (create, view, edit, archive, delete).
- **FR-003:** Upload files (PDF, DOCX, PPTX, XLSX, TXT/MD) to a project.
- **FR-004:** Store original files durably and associate to a project.
- **FR-005:** Extract text + structural metadata (pages/slides/sheets) from each
  file.
- **FR-006:** Chunk extracted content into retrieval-optimized segments with
  stable rules.
- **FR-007:** Generate embeddings via AI Gateway and index chunks in vector store.
- **FR-008:** Project-scoped chat with streaming responses.
- **FR-009:** Agent mode selection per chat (Orchestrator, Market Research,
  Architect, etc.).
- **FR-010:** Start a durable “Run” that executes research → spec pipeline.
- **FR-011:** Persist run step status, tool calls, citations, model usage, and
  artifacts.
- **FR-012:** Web research with citations (search + extraction).
- **FR-013:** Query up-to-date library docs via MCP (Context7) when needed.
- **FR-014:** Generate and version artifacts (PRD, ARCHITECTURE, SECURITY, ADRs,
  ROADMAP, CODEX prompts).
- **FR-015:** Render artifacts in UI as streaming Markdown (supports partial
  markdown).
- **FR-016:** Regenerate/refine artifacts via follow-up chat instructions.
- **FR-017:** Export deterministic zip of latest artifacts + citations.
- **FR-018:** Safe “Code Mode” execution for analysis tasks in isolated sandbox
  VMs.
- **FR-019:** Maintain project knowledge base from uploads + generated artifacts
  (retrievable).
- **FR-020:** Search across projects/files/runs/artifacts.
- **FR-021:** Fetch and cache the AI Gateway model catalog for UI model selection
  (script + cached JSON).

## Non-Functional Requirements

- **NFR-001 (Security):** Protect all sensitive routes, server-only keys, secure
  cookies.
- **NFR-002 (Single-user):** No multi-tenant assumptions or user tables required.
- **NFR-003 (Maintainability):** Strict TS, Zod v4, modular architecture, low
  boilerplate.
- **NFR-004 (Observability):** Persist logs, latency, token usage, tool calls,
  and errors.
- **NFR-005 (Determinism):** Export is deterministic: latest artifact versions,
  stable ordering.
- **NFR-006 (Cost controls):** Caching and guardrails limit web calls and token
  usage.
- **NFR-007 (Data retention):** Project deletion removes DB records, vector
  entries, and blob refs.
- **NFR-008 (Accessibility):** Keyboard-accessible and screen-reader friendly UI.
- **NFR-009 (Supply chain):** Automated scanning and dependency governance
  (Dependabot, Dependency Review, CodeQL, Scorecard).
- **NFR-010 (Quality gates):** CI enforces format/lint/typecheck/test/build with
  Bun-only commands.
- **NFR-011 (Agent-first DX):** Repository conventions optimized for AI coding
  agents (AGENTS.md, strict doc requirements, deterministic scripts).

## Performance & Reliability Requirements

- **PR-001:** Streaming begins within 1.5s (p95) for warm paths.
- **PR-002:** Retrieval top-k query within 250ms (p95) for warm paths.
- **PR-003:** Ingest 10MB PDF within 2 minutes (p95) excluding queue delay.
- **PR-004:** Runs complete despite client disconnects.
- **PR-005:** Workflow steps are idempotent and safe to retry.
- **PR-006:** CI completes within 10 minutes for typical PRs (p95).

## Integration Requirements

- **IR-001:** All model/embedding calls through Vercel AI Gateway.
- **IR-002:** Relational store is Neon Postgres.
- **IR-003:** Cache and rate limit via Upstash Redis + Ratelimit.
- **IR-004:** Orchestrate durable jobs via Upstash QStash.
- **IR-005:** Vector search via Upstash Vector.
- **IR-006:** File storage via Vercel Blob.
- **IR-007:** Web research via Exa + Firecrawl.
- **IR-008:** Library docs via MCP (Context7).
- **IR-009:** Code execution via Vercel Sandbox.
- **IR-010:** Bun toolchain: installs/scripts/CI use Bun and Vercel Functions run
  on Bun runtime where supported.
