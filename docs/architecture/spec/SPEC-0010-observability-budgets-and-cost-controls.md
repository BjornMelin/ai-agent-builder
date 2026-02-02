---
spec: SPEC-0010
title: Observability, budgets, and cost controls
version: 0.3.0
date: 2026-02-01
owners: ["you"]
status: Proposed
related_requirements: ["FR-011", "NFR-004", "NFR-006", "NFR-015", "PR-007"]
related_adrs: ["ADR-0013", "ADR-0024", "ADR-0025"]
notes: "Defines run-level budgets, telemetry, and cost control mechanisms."
---

## Summary

Define a unified budget and telemetry system for:

- research/spec runs
- implementation/deploy runs (longer and more expensive)

Budgets prevent runaway spend and enforce predictable execution.

## Context

Both research runs and implementation runs can incur variable costs (model
tokens, web research calls, sandbox compute, provisioning/deploy side effects).
Without explicit budgets and telemetry, the system is hard to operate safely
and hard to debug.

## Goals / Non-goals

### Goals

- Define a single budget model enforced across all run types.
- Persist telemetry and provenance for auditing and debugging.
- Support “pause and resume” via explicit over-budget behavior and approvals.

### Non-goals

- Real-time billing accuracy (cost estimates are approximate and provider-dependent).
- Exposing raw secrets or provider credentials in logs.

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-011:** Persist run step status, tool calls, citations, model usage, and
  artifacts.

### Non-functional requirements

- **NFR-004 (Observability):** Persist logs, latency, token usage, tool calls,
  and errors.
- **NFR-006 (Cost controls):** Caching and guardrails limit web calls and token
  usage.
- **NFR-015 (Auditability):** All side-effectful actions are logged with intent,
  parameters (redacted), and resulting external IDs.

### Performance / Reliability requirements (if applicable)

- **PR-007:** Implementation runs support hours-long workflows via queued steps
  and sandbox jobs without exhausting serverless request limits.

## Constraints

- Budgets must be enforced server-side and persisted as part of the run.
- Over-budget behavior must be explicit (halt + require user action).
- Telemetry must redact secrets and avoid storing raw credentials.

## Design

### Architecture overview

- A run has a budget envelope persisted at start.
- Each step checks remaining budgets before tool calls / sandbox jobs.
- Step outputs include usage and external IDs; logs are centrally redacted.

### Data contracts (if applicable)

- Budget envelope (conceptual):
  - token budgets (per-run/per-step)
  - tool budgets (per provider)
  - sandbox budgets (jobs/time/log size)
  - provisioning/deploy budgets (ops/attempts)
- Telemetry (conceptual):
  - step timings, token usage, tool calls, sandbox job transcripts, external IDs

### File-level contracts

- `src/lib/runs/budgets.ts`: budget model + enforcement helpers.
- `src/lib/log.ts`: log redaction and structured logging.
- `docs/architecture/runbook.md`: operational guidance for budgets.

### Configuration

- Budget defaults should be configurable per run type and surfaced in the UI,
  but must have safe defaults (deny runaway spend).

## Budget domains

### LLM budgets

- per-run max tokens (input + output)
- per-step max tokens
- max tool call steps (`maxSteps`)

### Web research budgets

- max Exa searches per run
- max Firecrawl extracts per run
- cache TTLs for repeated queries

### Sandbox budgets

- max sandbox jobs per run
- max wall clock per job (soft cap; hard cap enforced by sandbox provider)
- max concurrent jobs (global + per project)
- max log size per job (truncate + persist tail)

### Provisioning/deploy budgets

- max infra operations per run (create/update/delete)
- max deploy attempts per run
- explicit “dangerous ops” budget (default 0 unless enabled)

## Telemetry capture

- run timeline with step start/end timestamps
- model usage per step (tokens, cost estimates where available)
- tool call logs with redaction
- sandbox job transcripts (commands, exit codes, output summary)
- external IDs (PR, deployment, infra resources)

## Controls

- enforce budgets in orchestrator before calling tools
- hard-stop when exceeded; require explicit user override to continue
- cache retrieval and web research aggressively

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | ---: | ---: |
| Solution leverage | 0.35 | 9.0 | 3.15 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.07 / 10.0

### Supporting rationale (budget-focused)

| Criterion | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Prevent runaway costs | 0.35 | 9.2 | 3.22 |
| Supports long workflows safely | 0.25 | 9.1 | 2.28 |
| Ease of tuning | 0.20 | 9.0 | 1.80 |
| Auditability | 0.20 | 9.1 | 1.82 |
| **Total** | **1.00** | - | **9.12** |

## Acceptance criteria

- Each run records its budget envelope and step usage.
- Over-budget steps halt safely and require explicit user action to continue.
- Telemetry includes enough information to debug failures without leaking secrets.

## Testing

- Unit tests: budget arithmetic and enforcement (deny/allow decisions).
- Integration tests: run step persists usage and redacts logs.

## Operational notes

- Prefer conservative defaults; treat budget increases as an explicit user action.
- Watch for cost regressions via CI/runbook checks and dashboards.

## Failure modes and mitigation

- Underestimated budgets cause frequent halts → provide clear UI to adjust and
  resume, and improve default heuristics.
- Missing/incorrect redaction → treat as a security incident; rotate affected
  credentials and add regression tests.

## Key files

- `docs/architecture/spec/SPEC-0010-observability-budgets-and-cost-controls.md`
- `docs/architecture/runbook.md`
- `docs/architecture/security.md`

## References

- AI SDK tool loop budgets:
  - [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
  - [AI SDK Agents overview](https://ai-sdk.dev/docs/agents/overview)
- [ADR-0013](../adr/ADR-0013-caching-cost-controls-next-js-caching-upstash-redis-budgets.md)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-01)**: Updated for implementation/deploy workflows and sandbox budgets.
