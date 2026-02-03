# Implementation Order (Build Plan)

This document captures the recommended order to implement the **Implementation
Run** subsystem (plan → code → verify → deploy) described in:

- [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
- [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md)
- [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)
- [SPEC-0019](./spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)
- [SPEC-0020](./spec/SPEC-0020-project-workspace-and-search.md)

## Invariants (do not violate)

- No secrets in the database; persist only non-secret metadata and external IDs.
- All side-effectful actions are approval-gated and logged.
- Any repo checkout, patch apply, and verification runs in Vercel Sandbox (never
  in the app runtime).
- Bun-only commands (`bun run ...`) for all local/CI paths.

## Recommended build order

### Group 0 — Baseline plumbing (already started)

- Typed env + feature gates:
  - [ADR-0021](./adr/ADR-0021-environment-configuration-contracts-and-secret-handling.md)
  - [SPEC-0015](./spec/SPEC-0015-environment-configuration-contracts.md)
  - `src/lib/env.ts`, `.env.example`, [docs/ops/env.md](../ops/env.md)
- Data model extensions (implementation run entities):
  - [docs/architecture/data-model.md](./data-model.md)

### Group 1 — Repo connection + RepoOps foundation

- Repo connect/create APIs + UI skeleton:
  - **FR-022**
  - [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md)
  - [docs/architecture/api.md](./api.md)
- Repo indexing (code → chunks → embeddings → vector namespace):
  - **FR-032**
  - [ADR-0004](./adr/ADR-0004-retrieval-upstash-vector-for-semantic-search.md)
  - [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md)

### Group 2 — Sandbox verification jobs

- Sandbox job runner + transcripts + redaction:
  - [ADR-0010](./adr/ADR-0010-safe-execution-vercel-sandbox-bash-tool-code-execution-ctx-zip.md)
  - [SPEC-0019](./spec/SPEC-0019-sandbox-build-test-and-ci-execution.md)
  - [SPEC-0009](./spec/SPEC-0009-sandbox-code-mode.md) (shared execution model)
- Verification wiring:
  - **FR-026**
  - `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`

### Group 3 — Implementation Run engine

- Implementation Run type + durable step machine + persistence:
  - **FR-023, FR-024, FR-029, FR-031**
  - [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
  - [SPEC-0005](./spec/SPEC-0005-durable-runs-orchestration.md)
- Patchset → commit → PR integration:
  - **FR-025**
  - [ADR-0024](./adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md)
  - [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md)

### Group 4 — Approvals + external monitoring

- Approval UI + API and idempotency contracts:
  - **FR-031**
  - [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
  - [docs/architecture/api.md](./api.md)
- External status polling + optional webhooks:
  - **FR-029**
  - [SPEC-0017](./spec/SPEC-0017-repo-ops-and-github-integration.md) (GitHub)
  - [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md) (Vercel)

### Group 5 — Provisioning + deployment automation

- Provision/connect infra:
  - **FR-027**
  - [ADR-0025](./adr/ADR-0025-infrastructure-provisioning-and-vercel-deployment-automation.md)
  - [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)
- Vercel deployment automation:
  - **FR-028**
  - [SPEC-0018](./spec/SPEC-0018-infrastructure-provisioning-and-secrets-for-target-apps.md)
- Audit bundle export (deterministic):
  - **FR-034**
  - [SPEC-0016](./spec/SPEC-0016-implementation-runs-end-to-end-build-and-deploy.md)
  - [SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md)

### Group 6 — UX + unified search completion

- Workspace information architecture + deep links:
  - [SPEC-0020](./spec/SPEC-0020-project-workspace-and-search.md)
  - **FR-020**

## Verification checklist (each group)

- Unit/contract tests cover the new module boundaries.
- `bun run ci` passes.
- No feature requires credentials to build unless that feature is invoked.
- Approval-gated operations remain blocked without explicit approval.
