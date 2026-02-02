---
spec: SPEC-0019
title: Sandbox build/test/verification execution
version: 0.1.0
date: 2026-02-01
owners: ["you"]
status: Proposed
related_requirements: ["FR-026", "FR-018", "PR-007", "IR-009", "NFR-014", "NFR-015"]
related_adrs: ["ADR-0010", "ADR-0024"]
notes:
  "Defines standardized sandbox jobs used by Implementation Runs to run commands safely."
---

## Summary

Define the sandbox job runner that executes verification and utility commands in
isolated compute.

This spec focuses on Implementation Run needs (lint/typecheck/tests/build), and
is also reused by Code Mode for safe analysis execution.

## Context

Implementation Runs must run verification commands (lint/typecheck/test/build and
optional migrations) against potentially large repos without executing untrusted
code in the app runtime. Vercel Sandbox provides isolated compute (see
[Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)) and supports
long-running jobs with logs and resource controls (see
[Vercel Sandbox system specs](https://vercel.com/docs/vercel-sandbox/system-specifications)).

## Goals / Non-goals

### Goals

- Standardize sandbox job types and inputs/outputs.
- Enforce allowlists, timeouts, and redaction for all jobs.
- Persist transcripts and results for auditability and resumability.

### Non-goals

- Replacing repo CI systems; sandbox jobs complement CI and provide fast feedback.
- Running interactive Code Mode tasks here (see [SPEC-0009](./SPEC-0009-sandbox-code-mode.md)).

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-026:** Execute automated verification in sandboxed compute (lint,
  typecheck, tests, build, migrations) and persist results.
- **FR-018:** Safe “Code Mode” execution for analysis tasks in isolated sandbox
  VMs (reuses the same sandbox runner primitives).

### Non-functional requirements

- **NFR-014 (Sandbox isolation):** All command execution touching untrusted
  inputs or code runs in Vercel Sandbox.
- **NFR-015 (Auditability):** Side-effectful actions and outputs are logged with
  intent and external IDs.

### Performance / Reliability requirements (if applicable)

- **PR-007:** Implementation runs support hours-long workflows via queued steps
  and sandbox jobs without exhausting serverless request limits.

### Integration requirements (if applicable)

- **IR-009:** Code execution via Vercel Sandbox.

## Constraints

- No repo code runs in the app runtime.
- Logs must redact secrets and avoid writing secrets to disk.
- Jobs must be idempotent where possible and safe to retry.

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

Sandbox jobs provide a single interface for:

- repo checkout + patch application
- verification commands
- transcript capture + redaction

### Data contracts (if applicable)

- Sandbox job request (conceptual):
  - `jobType`, `inputs`, `timeoutSeconds`, `envKeys[]`
- Sandbox job result (conceptual):
  - `exitCode`, `artifacts[]`, `stdoutTail`, `stderrTail`, `timings`

### File-level contracts

- `docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`: canonical job taxonomy and contracts.
- `docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md`: sandbox decision and tool selection.

### Configuration

- Sandbox auth modes (see `docs/ops/env.md`):
  - OIDC token (preferred): `VERCEL_OIDC_TOKEN` (see
    [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication))
  - Access token fallback: `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (optional `VERCEL_TEAM_ID`) (see
    [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication))

## Principles

- No untrusted code executes in the app runtime.
- Sandbox jobs are deterministic, logged, and replayable.
- Commands are allowlisted; dangerous operations require explicit approvals.
- Secrets are injected only when required and are never written to disk.

## Authentication and configuration

Sandbox execution requires Vercel Sandbox credentials.

Preferred:

- `VERCEL_OIDC_TOKEN` (OIDC-based sandbox auth, typically on Vercel; see
  [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication))

Fallback (local dev / external CI):

- `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (+ optional `VERCEL_TEAM_ID`; see
  [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication))

## Job types

### repo.clone

Inputs:

- repo URL
- branch/commit SHA
- shallow clone depth

Outputs:

- workspace path (sandbox-internal)
- resolved commit SHA

### repo.applyPatch

Inputs:

- patch content
- file operation list (create/modify/delete)
- target branch

Outputs:

- applied files list
- `git diff` summary
- patch id

### verify.lint

Commands (example for Bun + Biome):

- `bun run lint`
- `bun run format:check`

### verify.typecheck

- `bun run typecheck`

### verify.test

- `bun run test`

### verify.build

- `bun run build`

### db.migrate (optional)

- `bun run db:migrate`

## Command allowlist

Allowlisted by default:

- git (clone/checkout/status/diff/add/commit)
- bun (install, lint, typecheck, test, build)
- node (for tooling)
- basic shell utilities (ls, cat, sed, rg)

Blocked by default:

- network scans / port probing
- credential exfiltration tools
- destructive filesystem ops outside workspace

## Log capture and redaction

- Capture stdout/stderr streams.
- Truncate logs above configured size; persist tail.
- Redact:
  - tokens in URLs (e.g., `https://x-access-token:...@github.com/...`)
  - known env var values
  - Authorization headers

Persist:

- command list
- exit codes
- timings
- artifact links to transcripts

## Timeouts and budgets

- Each job has a soft timeout and is subject to run budgets.
- Long jobs should be split:
  - clone → apply → verify → deploy
- Concurrency limits:
  - global limit.
  - per-project limit.

## Acceptance criteria

- Verification jobs run fully in Sandbox and never in the app runtime.
- Logs are persisted with redaction and include sufficient data for debugging.
- Jobs are bounded by timeouts, concurrency limits, and run budgets.

## Testing

- Unit tests: allowlist enforcement and redaction.
- Integration tests: run a minimal verification job and assert transcript capture.

## Operational notes

- Prefer splitting work into smaller jobs (clone → apply → verify) to reduce retry cost.
- Treat “missing redaction” as a security incident.

## Failure modes and mitigation

- Job timeout → persist partial logs and mark as retryable when safe.
- Sandbox unavailability → fall back to CI-only verification and pause the run.

## Key files

- `docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`
- `docs/architecture/spec/SPEC-0009-sandbox-code-mode.md`
- `docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md`

## References

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox system specs](https://vercel.com/docs/vercel-sandbox/system-specifications)
- [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)

## Changelog

- **0.1 (2026-02-01)**: Initial draft.
