---
spec: SPEC-0009
title: Sandbox “Code Mode”
version: 0.2.0
date: 2026-01-30
owners: ["you"]
status: Proposed
related_requirements: ["FR-018", "NFR-001", "NFR-004", "IR-009"]
related_adrs: ["ADR-0010"]
notes: "Defines safe code execution workflows in Vercel Sandbox."
---

## Summary

Defines how “Code Mode” executes commands and scripts safely in isolated VMs.

## Context

Some tasks require executing code or shell commands. This must be isolated from the app runtime.

## Goals / Non-goals

### Goals

- Isolate execution in Sandbox
- Restrict allowed commands and timeouts
- Capture logs and outputs for audit

### Non-goals

- Arbitrary long-running compute jobs

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-018**

### Non-functional requirements

- **NFR-001**
- **NFR-004**

### Performance / Reliability requirements (if applicable)

- None

### Integration requirements (if applicable)

- **IR-009**

## Constraints

- No server env vars exposed to sandbox
- Network egress controlled as supported

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | --- | --- |
| Solution leverage | 0.35 | 9.1 | 3.18 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.11 / 10.0

## Design

### Architecture overview

- Tools call Sandbox session APIs.
- All commands pass through an allowlist.

### Key files

- `src/lib/sandbox/client.ts`
- `src/lib/ai/tools/sandbox/*`

## Acceptance criteria

- Sandbox execution works for allowed commands
- Disallowed commands are rejected
- Execution logs persisted per run step

## Testing

- Contract: command allowlist enforced
- Integration: sandbox outputs captured

## Operational notes

- Monitor sandbox usage quotas and failures

## Failure modes and mitigation

- Sandbox start fails → retry and/or skip step with warning

## References

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
