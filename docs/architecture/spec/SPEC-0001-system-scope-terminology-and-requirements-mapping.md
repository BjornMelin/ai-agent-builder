---
spec: SPEC-0001
title: System scope, terminology, and requirements mapping
version: 0.3.0
date: 2026-02-01
owners: ["you"]
status: Proposed
related_requirements: ["FR-001", "FR-020", "FR-023", "NFR-011"]
related_adrs: ["ADR-0001", "ADR-0024", "ADR-0025"]
notes: "Defines system scope, glossary, and how requirements map to specs."
---

## Summary

Defines the overall system scope, vocabulary, and how requirements are organized.

## System scope

ai-agent-builder is a single-user application with **two major capability
domains**:

1) **Research → Spec Generation**
   - ingest uploads
   - do market/competitive research with citations
   - generate a complete documentation pack (PRD/SPECs/ADRs/security/roadmap)
   - export deterministic bundles (zip)

2) **Implementation → Deployment**
   - connect a target application repo
   - run long-lived implementation workflows that:
     - plan changes traceable to artifacts
     - modify code and open PRs
     - run verification in sandboxed compute
     - provision/connect infrastructure
     - deploy to production
   - persist a complete audit trail and export it deterministically

The repo is bootstrapped with core tooling and some foundational runtime modules,
but does not yet include the full target system. This spec establishes the
target boundaries and the canonical requirements catalog.

## Goals / Non-goals

### Goals

- Define scope and terminology for the entire system
- Provide a stable requirement ID catalog used across specs/ADRs
- Anchor file-level contracts to the `src/` repo layout
- Ensure the implementation/deploy phase is first-class (not “post-MVP”)

### Non-goals

- Implementing features (this is documentation-only)
- Supporting multi-tenant user accounts
- Running unbounded autonomous side effects without explicit approval gates

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-001** … **FR-021**
- **FR-022** … **FR-034**

### Non-functional requirements

- **NFR-001** … **NFR-015**

### Performance / Reliability requirements (if applicable)

- **PR-001** … **PR-008**

### Integration requirements (if applicable)

- **IR-001** … **IR-014**

## Constraints

- Private access mode by default (allowlist); no multi-tenant constructs
  required (org billing, collaboration).
- Server-only secrets and tool execution
- Bun-only scripts and installs
- Side-effectful operations are approval-gated and audited

## Glossary (system vocabulary)

This glossary is intentionally short; see
[docs/architecture/glossary.md](../glossary.md) for
the expanded glossary.

- **Project**: A workspace representing one target product/app.
- **Artifact**: A generated document output (PRD, ADR, SPEC, roadmap, prompts,
  audit bundles).
- **Run**: A durable multi-step pipeline execution for a project.
- **Research Run**: Run type that produces research outputs and artifacts.
- **Implementation Run**: Run type that modifies code, verifies, provisions infra,
  and deploys.
- **Step**: One discrete stage in a run (research scan, PRD draft, patch
  application, test job, deploy, etc.).
- **Sandbox job**: A unit of isolated command execution inside Vercel Sandbox.
- **Approval gate**: An explicit user action required before a side-effectful
  step can proceed.

## Requirements mapping to specs

- **Auth** → [SPEC-0002](./SPEC-0002-authentication-access-control.md)
- **Uploads + ingestion + indexing** → [SPEC-0003](./SPEC-0003-upload-ingestion-pipeline.md)
- **Chat + retrieval** → [SPEC-0004](./SPEC-0004-chat-retrieval-augmentation.md)
- **Durable runs** → [SPEC-0005](./SPEC-0005-durable-runs-orchestration.md)
- **Agent modes & tool governance** →
  [SPEC-0006](./SPEC-0006-agent-registry-orchestration-patterns.md)
- **Web research + citations** → [SPEC-0007](./SPEC-0007-web-research-citations-framework.md)
- **Artifacts + export** → [SPEC-0008](./SPEC-0008-artifact-generation-versioning-and-export-zip.md)
- **Sandbox execution** → [SPEC-0009](./SPEC-0009-sandbox-code-mode.md),
  [SPEC-0019](./SPEC-0019-sandbox-build-test-and-ci-execution.md)
- **Budgets & observability** → [SPEC-0010](./SPEC-0010-observability-budgets-and-cost-controls.md)
- **Implementation runs** → [SPEC-0016](./SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md),
  [SPEC-0017](./SPEC-0017-repo-ops-and-github-integration.md),
  [SPEC-0018](./SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md),
  [SPEC-0019](./SPEC-0019-sandbox-build-test-and-ci-execution.md)
- **Project workspace & search UX** → [SPEC-0020](./SPEC-0020-project-workspace-and-search.md)

## Decision Framework Score (must be ≥ 9.0)

| Criterion | Weight | Score | Weighted |
| --- | ---: | ---: | ---: |
| Clarity of scope & terminology | 0.35 | 9.2 | 3.22 |
| Maintains low future refactor cost | 0.25 | 9.0 | 2.25 |
| Alignment with repo conventions | 0.20 | 9.1 | 1.82 |
| Completeness for both phases | 0.20 | 9.2 | 1.84 |
| **Total** | **1.00** | - | **9.13** |

## Key files

- `docs/specs/requirements.md`
- `docs/architecture/overview.md`
- `docs/architecture/repository-baseline.md`

## References

- [AI SDK](https://ai-sdk.dev/docs/introduction)
- [Next.js App Router](https://nextjs.org/docs/app)

## Changelog

- **0.1 (2026-01-29)**: Initial draft.
- **0.2 (2026-01-30)**: Updated for current repo baseline (Bun, `src/` layout, CI).
- **0.3 (2026-02-01)**: Updated for implementation/deploy phase.
