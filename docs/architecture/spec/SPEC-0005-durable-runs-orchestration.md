---
spec: SPEC-0005
title: Durable runs & orchestration
version: 0.3.1
date: 2026-02-03
owners: ["you"]
status: Proposed
related_requirements:
  ["FR-010", "FR-011", "FR-023", "FR-029", "FR-031", "PR-004", "PR-005", "PR-007", "IR-004", "NFR-004", "NFR-013", "NFR-014", "NFR-015"]
related_adrs: ["ADR-0005", "ADR-0024"]
notes: "Defines durable run execution, step graph, retries, and QStash integration."
---

## Summary

Defines how durable run pipelines execute step-by-step with retries, idempotency,
and explicit step graphs.

See [SPEC-0021](./SPEC-0021-full-stack-finalization-fluid-compute-neon-upstash-ai-elements.md)
for the cross-cutting “finalization” plan that integrates durable runs with the
UI workflow view, DB persistence, and supporting infra (Neon/Upstash/AI Gateway).

Runs are used for:

- research/spec generation workflows
- implementation/deploy workflows (longer, more side effects, more gating)

## Context

Long-running pipelines must run reliably even when the user disconnects. We use
QStash to enqueue and retry step execution via signed HTTP requests.

Implementation runs add new constraints:

- steps may spawn sandbox jobs that run minutes to hours
- side-effectful steps require approvals
- steps may wait on external state (PR checks, deployment readiness)

## Goals / Non-goals

### Goals

- Durable run state persisted in DB
- Step graph explicit and versioned
- Idempotent step execution
- Retries and failure visibility in UI
- Support hours-long workflows through queued steps + sandbox jobs
- Support wait states (approval gates, external checks)

### Non-goals

- General-purpose workflow engine beyond this app
- Multi-tenant workflow separation

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-010:** Start a durable “Run” that executes research → spec pipeline.
- **FR-011:** Persist run step status, tool calls, citations, model usage, and
  artifacts.
- **FR-023:** Start a durable Implementation Run workflow.
- **FR-029:** Monitor and report implementation run progress across external
  systems until completion or failure.
- **FR-031:** Enforce an approval gate for side-effectful operations.

### Non-functional requirements

- **NFR-004 (Observability):** Persist logs, latency, token usage, tool calls,
  and errors.
- **NFR-013 (Least privilege):** Provider credentials are scoped to minimum
  required permissions; unsafe tools are gated by explicit approvals.
- **NFR-014 (Sandbox isolation):** Command execution touching untrusted inputs or
  code runs in Vercel Sandbox.
- **NFR-015 (Auditability):** All side-effectful actions are logged with intent,
  redacted parameters, and external IDs.

### Performance / Reliability requirements (if applicable)

- **PR-004:** Runs complete despite client disconnects.
- **PR-005:** Workflow steps are idempotent and safe to retry.
- **PR-007:** Implementation runs support hours-long workflows via queued steps
  and sandbox jobs.

### Integration requirements (if applicable)

- **IR-004:** Orchestrate durable jobs via Upstash QStash.

## Constraints

- Steps must be idempotent and safe to retry (QStash retries are expected).
- Side-effectful steps must be approval-gated (**FR-031**).
- Long-running compute and untrusted inputs/code must run in Sandbox, not the
  app runtime (**NFR-014**).
- Do not persist secrets in run step outputs; redact logs.

## Design

### Architecture overview

Durable runs are an explicit step graph (DAG) persisted in the database and
advanced by queued executions (QStash) and/or external polling steps.

This spec’s design details are captured in the following sections:

- Run types
- Step graph model
- Execution semantics
- QStash integration
- Failure handling

### Data contracts (if applicable)

- Run + step persistence: see `docs/architecture/data-model.md`.
- Step IO contract:
  - `run_steps.inputs`: stable JSON inputs and provenance references
  - `run_steps.outputs`: stable JSON outputs and external IDs.

### File-level contracts

- `src/app/api/runs/*`: Route Handlers that execute or resume steps (signed).
- `src/lib/runs/*`: run state machine, idempotency, and persistence helpers.
- `src/lib/upstash/qstash.server.ts`: publish + verify helpers for QStash integration.

### Configuration

- See `docs/ops/env.md` (see
  [QStash env vars](https://upstash.com/docs/qstash/howto/local-development)):
  - QStash publish: `QSTASH_TOKEN`
  - QStash verify: `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
  - Optional: budgets/caching via Upstash Redis (`UPSTASH_REDIS_*`)

## Run types

### Research run

Produces artifacts and citations from uploaded inputs + web research.

### Implementation run

Executes: plan → code → verify → deploy.

Implementation runs are a strict superset of research runs: they still log tools,
citations, and artifacts, but additionally:

- track repo state (branch, commit SHAs, PR numbers)
- track sandbox jobs (commands, logs, outputs)
- track external resources (deployments, infra IDs)
- enforce approval gates for side-effectful steps

## Step graph model

Represent a run as an explicit DAG of steps with:

- `step_id` (stable identifier)
- `step_kind` (llm, tool, sandbox, wait, approval, external_poll)
- `inputs` (JSON)
- `outputs` (JSON)
- `status` (pending, running, waiting, blocked, succeeded, failed, canceled)
- `retry_policy` (max retries, backoff, retryable errors)

For implementation runs, add:

- `requires_approval: boolean`
- `approval_scope: string` (merge, deploy, provision, delete, etc.)

## Execution semantics

- All steps must be **idempotent**:
  - if a step is repeated (QStash retry), it must detect prior completion and
    return the same output.
- A step may schedule the next step only after persisting:
  - its output
  - any external IDs produced (PR, deployment, sandbox job)
- “Wait” steps are first-class:
  - approval wait: user action unblocks
  - external wait: poll GitHub/Vercel until condition met.

## QStash integration

- Each step execution is triggered by a QStash message to a Next.js Route
  Handler.
- The handler verifies QStash signatures and idempotency keys.
- The handler executes the step and enqueues the next step.

## Failure handling

- Retry transient failures with exponential backoff.
- Mark steps failed on non-retryable errors.
- Persist the error payload and suggested remediation in run logs.
- Allow “resume from step” after user intervention when safe.

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | --- | ---: | ---: |
| Solution leverage | 0.35 | 9.2 | 3.22 |
| Application value | 0.30 | 9.3 | 2.79 |
| Maintenance & cognitive load | 0.25 | 9.0 | 2.25 |
| Architectural adaptability | 0.10 | 9.1 | 0.91 |

**Total:** 9.17 / 10.0

### Supporting rationale (workflow-focused)

| Criterion | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Reliability & idempotency | 0.35 | 9.3 | 3.26 |
| Fit for long workflows | 0.25 | 9.2 | 2.30 |
| Maintainability | 0.20 | 9.0 | 1.80 |
| Ecosystem alignment | 0.20 | 9.1 | 1.82 |
| **Total** | **1.00** | - | **9.18** |

## Acceptance criteria

- Runs execute to completion despite client disconnects (queued steps).
- Steps are idempotent and safe to retry without duplicating side effects.
- Side-effectful steps halt and surface an approval request before continuing.
- Run timelines include sufficient provenance to reconstruct what happened.

## Testing

- Unit tests: step idempotency helpers and error normalization.
- Unit tests: run engine enqueue behavior and status transitions
  (`src/lib/runs/run-engine.server.test.ts`).
- Integration tests: QStash signature verification and step scheduling.
- E2E (later): execute a small run end-to-end and validate status transitions.

## Operational notes

- Prefer small, explicit step graphs over “giant steps” to reduce retry blast
  radius.
- Enforce log redaction centrally and treat redaction regressions as security
  incidents.

## Failure modes and mitigation

- Duplicate QStash delivery → idempotency keys + step-level “already complete”
  checks.
- External provider outages (GitHub/Vercel/Upstash) → bounded retries with
  backoff, then surface remediation and pause.
- Approval deadlocks → timeouts with clear UI prompts and run cancellation path.

## Key files

- `docs/specs/requirements.md`
- `docs/architecture/spec/SPEC-0005-durable-runs-orchestration.md`
- `docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`
- `src/lib/upstash/qstash.server.ts`
- `src/lib/runs/run-engine.server.ts`

## References

- [Upstash QStash](https://upstash.com/docs/qstash/overall/getstarted)
- [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [ADR-0005](../adr/ADR-0005-orchestration-upstash-qstash-for-durable-workflows.md)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-01)**: Updated for implementation/deploy runs and approval waits.
- **0.3.1 (2026-02-03)**: Linked to SPEC-0021 as the cross-cutting finalization spec.
