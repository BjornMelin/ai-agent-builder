---
spec: SPEC-0006
title: Agent registry & orchestration patterns
version: 0.3.0
date: 2026-02-01
owners: ["you"]
status: Proposed
related_requirements: ["FR-009", "FR-033", "NFR-011", "NFR-013"]
related_adrs: ["ADR-0006", "ADR-0012", "ADR-0024"]
notes: "Defines agent modes, tool allowlists, and orchestration patterns."
---

## Summary

Defines:

- a registry of agent “modes” (roles)
- which tools each mode can access (least privilege)
- orchestration patterns for multi-agent workflows

The system uses AI SDK v6 agents and dynamic tools to reduce context bloat.

## Context

The app supports multiple “modes” (research, architect, QA, infra, etc.) and
two major workflow types (interactive chat vs durable runs). Without a registry
and least-privilege tool policy, agent behavior becomes unpredictable and
high-risk (especially during implementation/deploy workflows).

## Goals / Non-goals

### Goals

- Separate responsibilities into composable roles
- Enforce least-privilege tool allowlists per role
- Support both interactive chat and durable runs
- Support long implementation runs with specialized sub-agents

### Non-goals

- “One agent does everything” with all tools enabled
- Hidden side effects (all side effects are gated and logged)

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-009:** Agent mode selection per chat (Orchestrator, Market Research,
  Architect, etc.).
- **FR-033:** Support multi-agent orchestration for implementation (planner,
  coder, reviewer, QA, infra/deploy) with least-privilege tools per role.

### Non-functional requirements

- **NFR-011 (Agent-first DX):** Repository conventions optimized for AI coding
  agents (AGENTS.md, strict doc requirements, deterministic scripts).
- **NFR-013 (Least privilege):** Provider credentials are scoped to minimum
  required permissions; unsafe tools are gated by explicit approvals.

## Constraints

- Tool access must be explicitly allowlisted per agent mode (default deny).
- Side-effectful tools must be approval-gated (no silent commits/merges/deploys).
- Agents must log tool calls, redacting secrets (see **NFR-015** via run logs).

## Design

### Architecture overview

- A registry enumerates:
  - agent mode IDs and instructions
  - tool allowlists per mode
  - budget/limits per mode (max steps, max web calls, etc.)
- Orchestrators coordinate specialists and persist outputs into durable runs
  where applicable.

### Data contracts (if applicable)

- Agent registry entry (conceptual):
  - `modeId`, `displayName`, `instructions`, `tools`, `budgets`
- Run step payloads:
  - `toolCalls[]`, `toolResults[]`, `citations[]` (see `docs/architecture/data-model.md`)

### File-level contracts

- `src/lib/ai/agents/*`: agent definitions (ToolLoopAgent configs) per mode.
- `src/lib/ai/tools/*`: tool implementations and wrappers (typed schemas).
- `src/lib/ai/registry.ts`: canonical registry mapping mode → agent/tools.

### Configuration

- Tool allowlists must be enforced at agent construction time (not by “prompt
  instructions” alone).
- Dynamic tools (MCP/Context7) must be sandboxed/guarded and bounded by budgets.

## Agent modes

### Research/spec phase modes

- **Orchestrator**: routes tasks, picks sub-agents, enforces budgets.
- **Market Research**: competitor analysis, market sizing, positioning.
- **Product**: PRD structure, features, UX requirements.
- **Architecture**: tech stack, ADRs, system design, data model.
- **Security**: threat model, controls, privacy, compliance.
- **Docs**: polishing, formatting, consistent cross-linking.
- **Citation Auditor**: ensures claims are grounded with citations.

### Implementation/deploy phase modes

- **Implementation Orchestrator**: decomposes the plan into tasks, schedules
  sandbox jobs, enforces approvals and budgets.
- **Repo Engineer**: code changes, patch creation, commits, PR updates.
- **QA Engineer**: writes/runs tests, validates behavior, investigates failures.
- **Infra Engineer**: provisions/connects resources, configures env vars, checks
  migration paths.
- **Release Engineer**: deploy orchestration, post-deploy validation, rollbacks.
- **Reviewer**: critiques diffs for correctness and spec compliance (no tools or
  read-only tools).

## Tool allowlists (high-level)

Tools are provided via AI SDK `tool()` and `dynamicTool()` and/or MCP.

- **Web tools**: Exa search, Firecrawl extract (research-only).
- **Docs MCP**: Context7 query (allowed in research + implementation).
- **Retrieval**: Upstash Vector query; internal chunk fetch (allowed broadly).
- **Sandbox execution**: sandbox job runner (implementation + code mode; gated).
- **Repo tools**: GitHub API (PR creation/merge/status), git operations within
  sandbox (implementation; gated).
- **Deployment tools**: Vercel API/SDK for projects/env/deploy (implementation;
  gated).
- **Provisioning tools**: Neon API, Upstash Developer API (implementation; gated).

## Orchestration patterns

### Pattern A — Single-agent with tool loop (interactive)

Used for chat where the user wants a direct answer; agent may call retrieval and
doc tools.

### Pattern B — Coordinator + specialists (runs)

Used for durable runs:

- Coordinator agent maintains the plan, state machine, and budgets.
- Specialists run bounded tasks with restricted tools.
- Coordinator persists outputs and schedules next steps.

### Pattern C — Approval-gated execution

Any side-effectful tool call triggers an approval request, producing:

- intent summary
- parameters (redacted)
- expected outcomes
- rollback plan (where applicable)

Only after approval is the tool call executed.

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | ---: | ---: |
| Solution leverage | 0.35 | 9.1 | 3.19 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.11 / 10.0

### Supporting rationale (agent-focused)

| Criterion | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Safety via least privilege | 0.35 | 9.3 | 3.26 |
| DX & maintainability | 0.25 | 9.0 | 2.25 |
| Scalability to new agents | 0.20 | 9.1 | 1.82 |
| Alignment with AI SDK patterns | 0.20 | 9.2 | 1.84 |
| **Total** | **1.00** | - | **9.17** |

## Acceptance criteria

- Agent modes are selectable and produce mode-appropriate behavior.
- Each mode has an explicit tool allowlist (default deny).
- Side-effectful actions are gated and logged with redaction.

## Testing

- Unit tests: tool schemas validate inputs; allowlists enforced per mode.
- Integration tests: dynamicTool/Context7 requests are bounded and logged.
- E2E (later): run a multi-agent implementation flow and verify approvals.

## Operational notes

- Keep agent instructions short and mode-specific; avoid “mega prompts”.
- Treat tool allowlists as part of the security posture (review changes like code).

## Failure modes and mitigation

- Tool access creep (too many tools per mode) → require least-privilege review
  and add a “read-only” Reviewer mode.
- Hallucinated side effects (“I deployed”) → require tool-call provenance for any
  claim of side effects.

## Key files

- `docs/architecture/spec/SPEC-0006-agent-registry-orchestration-patterns.md`
- `docs/architecture/adr/ADR-0006-agent-runtime-ai-sdk-v6-toolloopagent-streaming-ui-responses.md`
- `docs/architecture/adr/ADR-0012-mcp-dynamic-tools-context7-via-mcp-dynamictool.md`

## References

- [AI SDK Agents](https://ai-sdk.dev/docs/agents/overview)
- [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [dynamicTool](https://ai-sdk.dev/docs/reference/ai-sdk-core/dynamic-tool)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-01)**: Updated for implementation/deploy phase modes.
