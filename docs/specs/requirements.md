# Requirements Catalog

Requirement IDs referenced by SPECs and ADRs.

This catalog is intentionally **repo- and implementation-agnostic**: it defines
behavior and constraints. Specs and ADRs map these IDs to concrete files and
components.

## Functional Requirements

### Core workspace + research → spec pipeline

- **FR-001:** Managed authentication via Neon Auth (GitHub/Vercel OAuth and/or
  credentials) with secure, server-managed session cookies (httpOnly; Secure in
  prod) and app-level access control.
- **FR-002:** Project CRUD (create, view, edit, archive, delete).
- **FR-003:** Upload files (PDF, DOCX, PPTX, XLSX, TXT/MD) to a project.
- **FR-004:** Store original files durably and associate to a project.
- **FR-005:** Extract text + structural metadata (pages/slides/sheets) from each
  file.
- **FR-006:** Chunk extracted content into retrieval-optimized segments with
  stable rules.
- **FR-007:** Generate embeddings via AI Gateway and index chunks in vector store.
- **FR-008:** Project-scoped, multi-turn chat with streaming responses that can
  resume after disconnects/timeouts.
- **FR-009:** Agent mode selection per chat (Orchestrator, Market Research,
  Architect, etc.).
- **FR-010:** Start a durable, multi-step “Run” that executes the research → spec
  pipeline (and serves as the base workflow pattern for other runs).
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

### End-to-end implementation + deployment workflows

- **FR-022:** Connect a target application repository to a project (create new or
  link existing) and persist repo metadata (provider, owner/name, default
  branch, URLs).
- **FR-023:** Start a durable **Implementation Run** that executes a structured
  plan → code → verify → deploy workflow.
- **FR-024:** Generate a machine-readable implementation plan (tasks with
  acceptance criteria) traceable to the project’s generated artifacts
  (PRD/SPECs/ADRs).
- **FR-025:** Apply code changes as atomic patches with commit metadata; create
  and manage pull requests for review/approval.
- **FR-026:** Execute automated verification in sandboxed compute (lint,
  typecheck, tests, build, migrations) and persist results.
- **FR-027:** Provision or connect required infrastructure for the target app
  (database, cache, vector, queues) and persist non-secret resource metadata.
- **FR-028:** Create and configure a deployment target (Vercel project), set
  environment variables, and promote deployments to production.
- **FR-029:** Monitor and report implementation run progress across external
  systems (repo checks, deployment status) until completion or failure.
- **FR-030:** Persist implementation artifacts (patch sets, command transcripts,
  test reports, deployment links, infra config summaries) as versioned artifacts.
- **FR-031:** Enforce an approval gate for **side-effectful** operations
  (commits/pushes, PR merges, provisioning, production deploys, destructive
  cleanups).
- **FR-032:** Index target repo source code for retrieval (chunking + embeddings
  with metadata filters and namespaces) to support code-aware agents.
- **FR-033:** Support multi-agent orchestration for implementation (planner,
  coder, reviewer, QA, infra/deploy) with least-privilege tools per role.
- **FR-034:** Generate an implementation audit bundle: deterministic export of
  plan, patches, verification logs, infra metadata, and deployment provenance.

## Non-Functional Requirements

- **NFR-001 (Security):** Protect all sensitive routes, server-only keys, secure
  cookies.
- **NFR-002 (Private access mode):** Default to restricted access (allowlist);
  do not require multi-tenant constructs (orgs, billing, collaboration).
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
- **NFR-008 (Accessibility):** Keyboard-accessible and screen-reader-friendly UI.
- **NFR-009 (Supply chain):** Automated scanning and dependency governance
  (Dependabot, Dependency Review, CodeQL, Scorecard).
- **NFR-010 (Quality gates):** CI enforces format/lint/typecheck/test/build with
  Bun-only commands.
- **NFR-011 (Agent-first DX):** Repository conventions optimized for AI coding
  agents (AGENTS.md, strict doc requirements, deterministic scripts).
- **NFR-012 (BYOK gating):** Public sign-up must remain disabled until the app
  supports BYOK for any metered third-party provider keys.
- **NFR-013 (Least privilege):** Provider credentials are scoped to minimum
  required permissions; unsafe tools are gated by explicit approvals.
- **NFR-014 (Sandbox isolation):** All command execution that touches untrusted
  inputs or code runs in Vercel Sandbox; app runtime stays minimal.
- **NFR-015 (Auditability):** All side-effectful actions are logged with intent,
  parameters (redacted), and resulting external IDs (PR, deployment, resource
  IDs).

## Performance & Reliability Requirements

- **PR-001:** Streaming begins within 1.5s (p95) for warm paths.
- **PR-002:** Retrieval top-k query within 250ms (p95) for warm paths.
- **PR-003:** Ingest 10 MB PDF within 2 minutes (p95) excluding queue delay.
- **PR-004:** Runs and interactive chat streams resume after client
  disconnects/timeouts and continue to completion.
- **PR-005:** Workflow steps are idempotent and safe to retry.
- **PR-006:** CI completes within 10 minutes for typical PRs (p95).
- **PR-007:** Implementation runs support hours-long workflows via queued steps
  and sandbox jobs without exhausting serverless request limits.
- **PR-008:** Repo indexing supports 25k files / 250 MB repos with bounded memory
  by incremental chunking and streaming.

## Integration Requirements

- **IR-001:** All model/embedding calls through Vercel AI Gateway.
- **IR-002:** Relational store is Neon Postgres.
- **IR-003:** Cache and rate limit via Upstash Redis + Ratelimit.
- **IR-004:** Orchestrate **background** durable jobs via Upstash QStash
  (ingestion/fanout); interactive runs use Vercel Workflow DevKit.
- **IR-005:** Vector search via Upstash Vector (prefer HYBRID indexes when
  provisioning).
- **IR-006:** File storage via Vercel Blob.
- **IR-007:** Web research via Exa + Firecrawl.
- **IR-008:** Library docs via MCP (Context7).
- **IR-009:** Code execution via Vercel Sandbox.
- **IR-010:** Bun toolchain: installs/scripts/CI use Bun and Vercel Functions run
  on Bun runtime where supported.
- **IR-011:** Repo operations via GitHub (API + Git over HTTPS).
- **IR-012:** Deployments and env var management via Vercel API/SDK.
- **IR-013:** Optional: Provision Neon resources via Neon API.
- **IR-014:** Optional: Provision Upstash resources via Upstash Developer API.
