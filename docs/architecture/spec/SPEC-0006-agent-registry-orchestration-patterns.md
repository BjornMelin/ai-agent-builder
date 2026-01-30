---
spec: SPEC-0006
title: Agent registry & orchestration patterns
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-009", "FR-010", "NFR-003", "NFR-006"]
related_adrs: ["ADR-0006", "ADR-0012", "ADR-0013"]
notes: "Defines agent modes, tool exposure, dynamic tools, and orchestration."
---

## Summary

Defines agent modes, how tools are assigned, and orchestration patterns across a run.

## Context

Different phases (research, architecture, PRD writing) need different tool access and prompts. Tool exposure must be minimal and dynamic to avoid bloat and reduce risk.

## Goals / Non-goals

### Goals

- Define agent modes and responsibilities
- Minimize tools per agent (least privilege)
- Support dynamic tool injection (MCP, web tools, sandbox)
- Standardize citation and output formats

### Non-goals

- Training custom models

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-009**
- **FR-010**

### Non-functional requirements

- **NFR-003**
- **NFR-006**

### Performance / Reliability requirements (if applicable)

- **PR-001**

### Integration requirements (if applicable)

- **IR-001**
- **IR-007**
- **IR-008**
- **IR-009**

## Constraints

- All tool calls logged and budgeted
- Dynamic tools only loaded when needed

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.3 | 3.25 |
| Application value | 0.30 | 9.4 | 2.82 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.2 | 0.92 |

**Total:** 9.24 / 10.0

## Design

### Architecture overview

- `OrchestratorAgent`: controls step sequencing.
- `ResearchAgent`: Exa/Firecrawl + citations.
- `ArchitectAgent`: MCP docs + architecture drafting.
- `WriterAgent`: final PRD/ADR/SPEC generation.

### File-level contracts

- `src/lib/ai/agents/registry.ts`
- `src/lib/ai/agents/modes.ts`
- `src/lib/ai/tools/*`

## Acceptance criteria

- Each agent mode has a documented tool allowlist
- Optional tools are injected dynamically, not always present
- Budgets limit tool calls and step count

## Testing

- Unit: registry returns correct tools per mode
- Contract: disallowed tool calls are rejected

## Operational notes

- Track per-mode usage and costs

## Failure modes and mitigation

- Tool bloat increases context → enforce dynamicTool and tool caps

## Key files

- `src/lib/ai/agents/registry.ts`
- `src/lib/ai/tools`

## References

- [dynamicTool](https://ai-sdk.dev/docs/reference/ai-sdk-core/dynamic-tool)
- [ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
