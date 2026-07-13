---
spec: SPEC-0019
title: Sandbox build/test/verification execution
version: 0.6.0
date: 2026-07-13
owners: ["Bjorn Melin"]
status: Implemented
related_requirements:
  ["FR-026", "FR-018", "PR-007", "IR-009", "NFR-014", "NFR-015", "NFR-016"]
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

Requirement IDs are defined in [docs/specs/requirements.md](/docs/specs/requirements.md).

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
- durable sandbox ownership and shutdown confirmation

### Data contracts (if applicable)

- Sandbox job request (conceptual):
  - `jobType`, `inputs`, `timeoutSeconds`, `envKeys[]`
- Sandbox job result (conceptual):
  - `exitCode`, `artifacts[]`, `stdoutTail`, `stderrTail`, `timings`

#### Cancellation lifecycle

- `runs.cancel_requested_at` is the durable cancellation fence. Persist it before
  canceling the workflow or stopping sandboxes.
- Cancellation bypasses request memoization to reread the Workflow ID after the
  fence commits, and an already-canceled app run retries its known Workflow
  cancellation before declaring cleanup complete.
- Sandbox job creation locks its parent run row. It rejects fenced and terminal
  runs before provisioning starts.
- Provisioning jobs persist the native Workflow step ID as
  `provisioning_key`. `(run_id, provisioning_key)` is unique, so every retry
  reuses one durable job and any already-published sandbox.
- `provisioning_claimed_at` and `provisioning_expires_at` bound an unknown
  provider response using the database clock. Creation passes a native
  `AbortSignal`, but Vercel Sandbox exposes no server idempotency key; after a
  lost response, no replacement may start until the create deadline plus the
  configured sandbox TTL guarantees that the unknown resource has expired.
- A live unknown-resource window raises Workflow's native retryable error with
  `retryAfter` set to the persisted expiry instead of consuming immediate retries.
- Active jobs transition from `pending|running` to `canceling`, then to
  `canceled` after resource cleanup.
- A database lifecycle trigger protects rolling deployments: it rejects legacy
  inserts after the run fence, promotes late metadata `sandboxId` values into
  first-class ownership, preserves cancellation and terminal states, and gives
  legacy no-ID writes the conservative 31-minute reconciliation window.
- `canceling` is a durable, retryable claim. A concurrent activation publishes
  its `sandbox_id` but cannot restore `running` or publish success.
- `sandbox_jobs.sandbox_id` records resource ownership independently from job
  metadata. `sandbox_stopped_at` records confirmed cleanup.
- Cancellation immediately terminalizes an active job whose run-owned sandbox
  already has a durable `sandbox_stopped_at` confirmation.
- `sandbox_stop_claimed_at` is an expiring stop lease. It prevents concurrent
  cancellation requests from issuing duplicate provider stop calls.
- Cancellation scans every job, including terminal jobs. A succeeded job may
  still own a shared sandbox when `stopOnFinalize` is false.
- A claimed job without a sandbox ID remains `canceling` until its provisioning
  window expires. A cancellation retry then completes it without provider I/O,
  preventing a permanent no-ID cancellation wedge.
- One deadline covers sandbox lookup, blocking stop, provider confirmation, and
  persistence of `sandbox_stopped_at`. `stopped|failed|aborted` states and a
  `404` lookup confirm idempotent cleanup.
- Activation failures first publish the known sandbox ID. If that write is
  unavailable, the runner directly stops the returned Sandbox object and then
  atomically records ownership plus stop confirmation. Cleanup failures remain
  non-terminal and are never swallowed.
- Successful finalization and explicit Implementation Run shutdown use the same
  leased stop owner. A job cannot persist success until shutdown is confirmed.
- Checkout failure stops its newly provisioned sandbox before persisting a
  terminal job state. If cleanup or terminal persistence fails, the Workflow
  step remains retryable instead of hiding an orphan behind a failed job.
- The parent records checkout sandbox ownership before outer step persistence
  or stream emission, so failures in either wrapper still enter cleanup.
- The parent Implementation Run catch does not persist terminal step or run
  state while shutdown of its active sandbox remains unconfirmed.
- Each confirmed sandbox stop persists independently. One failed stop does not
  discard confirmations for other sandboxes.
- The parent run becomes `canceled` only after workflow cancellation and all
  run-owned sandbox shutdowns are confirmed.

### File-level contracts

- [docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md](/docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md): canonical job taxonomy and contracts.
- [docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-native-tools.md](/docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-native-tools.md): sandbox decision and tool selection.

### Configuration

- Sandbox auth modes (see [docs/ops/env.md](/docs/ops/env.md)):
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

Commands (example for Bun + Biome / Node repos):

- `bun run lint`
- `bun run format:check`

Commands (example for Python repos with `uv`):

- `uv run ruff check .`

### verify.typecheck

Node repos:

- `bun run typecheck`

Python repos:

- `uv run pyright` (preferred) or `uv run mypy .`

### verify.test

Node repos:

- `bun run test`

Python repos:

- `uv run pytest`

### verify.build

Node repos:

- `bun run build`

Python repos:

- Optional / repo-defined (often no build step; treat as N/A unless configured).

### db.migrate (optional)

- `bun run db:migrate`

## Command allowlist

Allowlisted by default:

- git (clone/checkout/status/diff/add/commit)
- bun (install, lint, typecheck, test, build) when available
- uv (sync, run) for Python repos (python3.13 runtime)
- node (for tooling)
- bunx/npx (restricted to explicit allowlisted packages/bins)
- basic shell utilities (ls, cat, sed, rg)

Blocked by default:

- network scans / port probing
- credential exfiltration tools
- destructive filesystem ops outside workspace
- path traversal (`..`) and absolute paths outside `/vercel/sandbox` (**NFR-016**)
- package-exec bypasses (e.g. `pnpm dlx`, `npm exec`) unless explicitly approved

## Log capture and redaction

- Capture stdout/stderr streams.
- Truncate logs above configured size; persist tail.
- Redact:
  - tokens in URLs (e.g., `https://x-access-token:...@github.com/...`)
    The `...` is intentional in examples for copy/paste safety; do not replace
    it with a typographical ellipsis.
  - known env var values
  - Authorization headers.

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
- A durable cancellation fence prevents new sandbox jobs and provisioning.
- Cancellation stops sandbox IDs from active and terminal jobs.
- A run remains non-terminal while any sandbox stop or no-ID provisioning race
  needs a retry.
- Successful sandbox stops remain recorded when another stop fails.
- Workflow retries reuse the same provisioning job and cannot create a second
  sandbox during the recorded unknown-resource window.

## Testing

- Unit tests: allowlist enforcement and redaction.
- Integration tests: run a minimal verification job and assert transcript capture.
- Cancellation tests cover creation/fence serialization, activation/claim races,
  stable retry keys, activation-write failpoints, shared terminal-job sandboxes,
  and no-ID provisioning expiry races.
- SDK shutdown tests cover deadlines, partial failures, terminal states, and
  missing sandboxes, lookup timeouts, and stop-confirmation persistence.
- Concurrency tests verify that a fresh stop lease blocks duplicate provider
  calls and that failed attempts release their lease for retry.
- Tooling note: exclude generated Workflow routes under `src/app/.well-known/workflow/**`
  from Zod audits and lint rules that target app-authored code.

## Operational notes

- Prefer splitting work into smaller jobs (clone → apply → verify) to reduce retry cost.
- Treat “missing redaction” as a security incident.

## Failure modes and mitigation

- Job timeout → persist partial logs and mark as retryable when safe.
- Sandbox unavailability → fall back to CI-only verification and pause the run.
- Stop timeout or provider error → keep the job `canceling` and retry cleanup.
- Provisioning race without a sandbox ID → keep the job `canceling` through the
  recorded provider TTL window, then complete it on the next cancellation retry.
- Partial shutdown failure → retain each successful `sandbox_stopped_at` marker
  and retry only unconfirmed sandbox IDs.

## Key files

- [docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md](/docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)
- [docs/architecture/spec/SPEC-0009-sandbox-code-mode.md](/docs/architecture/spec/SPEC-0009-sandbox-code-mode.md)
- [docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-native-tools.md](/docs/architecture/adr/ADR-0010-safe-execution-vercel-sandbox-native-tools.md)

## Changelog

- **0.1 (2026-02-01)**: Initial version.
- **0.2 (2026-02-09)**: Added Python (`uv`) verification patterns and explicit sandbox command policy constraints.
- **0.3 (2026-07-13)**: Added retryable sandbox job cancellation and blocking shutdown confirmation.
- **0.4 (2026-07-13)**: Added the run fence, first-class sandbox ownership, expiring stop leases, race-safe activation, per-resource shutdown persistence, and bounded idempotent cleanup.
- **0.5 (2026-07-13)**: Added stable Workflow provisioning keys, database-clock unknown-resource windows, native create cancellation, activation-write recovery, and stop-confirmed finalization.
- **0.6 (2026-07-13)**: Made checkout and parent-run failure paths cleanup-first, refreshed Workflow ownership after fencing, and protected late legacy sandbox writes during rolling deployment.

## References

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)
- [Vercel Sandbox system specs](https://vercel.com/docs/vercel-sandbox/system-specifications)
- [Vercel Sandbox authentication](https://vercel.com/docs/vercel-sandbox/concepts/authentication)
