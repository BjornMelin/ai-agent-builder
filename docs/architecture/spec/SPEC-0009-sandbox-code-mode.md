---
spec: SPEC-0009
title: Sandbox “Code Mode”
version: 0.2.0
date: 2026-02-01
owners: ["Bjorn Melin"]
status: Implemented
related_requirements: ["FR-018", "FR-031", "NFR-014", "IR-009"]
related_adrs: ["ADR-0010"]
notes: "Defines the user-facing safe code execution mode for analysis tasks."
---

## Summary

Defines “Code Mode”: an agent capability to execute code/commands in an isolated
Vercel Sandbox environment for **analysis** and bounded utility tasks
(see [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)).

Code Mode is distinct from the sandbox job runner used by Implementation Runs
(see [SPEC-0019](./SPEC-0019-sandbox-build-test-and-ci-execution.md)): Code Mode
is interactive and user-invoked; Implementation
Runs use sandbox jobs as part of a durable workflow.

## Context

Some tasks require running untrusted or semi-trusted code (parsers, quick data
analysis, verifying assumptions) without risking the app runtime or leaking
secrets. Vercel Sandbox provides ephemeral isolated compute suitable for these
tasks (see [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) and
[Vercel Sandbox reference](https://vercel.com/docs/vercel-sandbox/reference/readme)).

## Goals / Non-goals

### Goals

- Provide safe, isolated execution for:
  - parsing files
  - running small scripts
  - validating assumptions with deterministic computation
- Never run untrusted code in the app runtime
- Keep outputs and logs attached to the project/run for auditability

### Non-goals

- Unbounded autonomous execution without user intent
- Running long, multi-hour build pipelines via Code Mode UI (use Implementation
  Runs + sandbox jobs instead)
- Storing secrets inside sandbox file systems

## Requirements

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

### Functional requirements

- **FR-018:** Safe “Code Mode” execution for analysis tasks in isolated sandbox
  VMs.
- **FR-031:** Side-effectful actions require explicit approval gates.

### Non-functional requirements

- **NFR-014 (Sandbox isolation):** Command execution touching untrusted inputs or
  code runs in Vercel Sandbox.

### Integration requirements (if applicable)

- **IR-009:** Code execution via Vercel Sandbox.

## Constraints

- Never execute user-provided code in the app runtime.
- Secrets are injected only when required and must not be written to sandbox
  disk or echoed in logs.
- Commands must be allowlisted; network egress is restricted where supported.
- Any side-effectful action requires explicit approvals (**FR-031** via the run
  engine policy).

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | ---: | ---: |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.2 | 2.76 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.14 / 10.0

## Design

### Architecture overview

- UI triggers a sandbox session for an explicit user-invoked action.
- The server coordinates sandbox creation and streams logs/output back to the UI.
- Transcripts and outputs are persisted as artifacts for auditability.

### Data contracts (if applicable)

- Code Mode request (conceptual):
  - `projectId`, `command`/`script`, `inputs[]`, `timeoutSeconds`
- Code Mode result (conceptual):
  - `exitCode`, `stdoutTail`, `stderrTail`, `artifacts[]`

### File-level contracts

- `src/app/api/code-mode/*`: Route Handlers for starting and streaming Code Mode jobs.
- `src/lib/sandbox/*`: Sandbox client wrapper, allowlists, log capture/redaction.
- `src/lib/runs/*`: persistence of transcripts/output as run step artifacts.

### Configuration

- Sandbox auth modes (see [docs/ops/env.md](/docs/ops/env.md); see
  [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)):
  - OIDC token (preferred): `VERCEL_OIDC_TOKEN`
  - Access token fallback: `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (optional `VERCEL_TEAM_ID`)

## Security model

- Sandbox jobs execute with minimal environment variables.
- Secrets are never written to disk inside sandbox.
- Commands are allowlisted; destructive operations are blocked by default.
- Side-effectful operations require explicit approval gates.

## Interfaces

- UI: “Code Mode” panel in project workspace.
- API: route handler that starts a sandbox job and streams outputs.
- Storage: persist transcripts and outputs as run step artifacts.

## References

- Vercel Sandbox:
  - [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
  - [Vercel Sandbox reference](https://vercel.com/docs/vercel-sandbox/reference/readme)
  - [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)

## Acceptance criteria

- Code Mode runs only in Sandbox and never in the app runtime.
- Outputs are streamed to the UI and persisted as artifacts with redaction.
- Allowlists prevent destructive operations and obvious exfiltration paths.

## Testing

- Unit tests: allowlist enforcement and log redaction.
- Integration tests: sandbox job produces persisted transcript artifacts.

## Operational notes

- Default to short timeouts; require explicit opt-in for longer runs.
- Treat any secret leakage in logs as a security incident.

## Failure modes and mitigation

- Sandbox creation fails → surface actionable error and fallback instructions.
- Command times out → persist partial logs and mark step retryable.

## Key files

- [docs/architecture/spec/SPEC-0009-sandbox-code-mode.md](/docs/architecture/spec/SPEC-0009-sandbox-code-mode.md)
- [docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md](/docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md)
- [docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md](/docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-02-01)**: Updated for Sandbox auth modes and Implementation Run reuse.
