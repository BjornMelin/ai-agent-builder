---
spec: SPEC-0010
title: Observability, budgets, and cost controls
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-011", "NFR-004", "NFR-006", "IR-001", "IR-003"]
related_adrs: ["ADR-0013", "ADR-0007"]
notes: "Defines telemetry capture and budget enforcement."
---

## Summary

Defines what telemetry is captured and how budgets are enforced to control cost.

## Context

Agent workflows can be expensive and opaque. We need per-step metrics and hard caps.

## Goals / Non-goals

### Goals

- Persist per-step token/tool usage
- Enforce max steps and tool call budgets
- Expose run timeline in UI

### Non-goals

- Full distributed tracing across external providers

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-011**

### Non-functional requirements

- **NFR-004**
- **NFR-006**

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- **IR-001**
- **IR-003**

## Constraints

- Budgets must be enforced server-side
- Persist telemetry without leaking secrets

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.1 | 3.18 |
| Application value | 0.30 | 9.3 | 2.79 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.13 / 10.0

## Design

### Architecture overview

- Each step writes `latency_ms`, `token_usage`, `tool_calls`, `cache_hits`.
- Budget gate checks at step start.

### Key files

- `src/lib/telemetry/*`
- `src/lib/config/budgets.ts`

## Acceptance criteria

- Run step logs include model usage and tool calls
- Budgets prevent unbounded loops

## Testing

- Unit: budget gate logic
- Integration: telemetry persisted for a sample run

## Operational notes

- Add an admin panel for budgets if needed

## Failure modes and mitigation

- Budget exceeded → stop run and mark failed with actionable message

## References

- [AI Gateway](https://vercel.com/docs/ai-gateway)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
