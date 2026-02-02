---
spec: SPEC-0017
title: RepoOps and GitHub integration
version: 0.1.0
date: 2026-02-01
owners: ["you"]
status: Proposed
related_requirements:
  ["FR-022", "FR-025", "FR-029", "FR-031", "FR-032", "IR-011", "NFR-013", "NFR-015"]
related_adrs: ["ADR-0024", "ADR-0021", "ADR-0010"]
notes:
  "Defines how the system connects to GitHub, manages branches/PRs, and indexes repos for implementation runs."
---

## Summary

Define a RepoOps subsystem that enables Implementation Runs to:

- connect or create a GitHub repo
- clone/check out code in sandbox
- apply patches and commit
- open PRs, monitor checks, and merge after approval
- index repo code for retrieval

## Context

Implementation Runs require safe, reviewable changes to a target repository with
strong auditability and resumability. RepoOps provides a single, consistent
interface for repo connection, patch application, verification, PR workflows,
and repo indexing.

## Goals / Non-goals

### Goals

- Support PR-based GitOps delivery (branches + PRs + required checks).
- Keep all repo execution inside sandboxed checkouts (no repo code runs in app runtime).
- Persist enough provenance to resume runs and generate audit bundles.

### Non-goals

- Bypassing branch protections or required checks.
- Supporting non-GitHub providers in the initial implementation.

## Requirements

Requirement IDs are defined in `docs/specs/requirements.md`.

### Functional requirements

- **FR-022:** Connect a target application repository to a project and persist
  repo metadata.
- **FR-025:** Apply code changes as patches/commits and create/manage PRs for review.
- **FR-029:** Monitor and report implementation run progress across external systems.
- **FR-031:** Enforce an approval gate for side-effectful operations (push/merge).
- **FR-032:** Index target repo source code for retrieval to support code-aware agents.

### Non-functional requirements

- **NFR-013 (Least privilege):** Provider credentials are scoped to minimum
  required permissions; unsafe tools are gated by explicit approvals.
- **NFR-015 (Auditability):** All side-effectful actions are logged with intent,
  parameters (redacted), and resulting external IDs.

### Integration requirements (if applicable)

- **IR-011:** Repo operations via GitHub (API + Git over HTTPS).

## Constraints

- Use least-privilege credentials; prefer fine-grained PATs initially.
- Do not persist repo secrets (tokens, deploy keys); redact logs.
- Respect GitHub API limitations: Checks API write requires GitHub Apps; PAT
  mode must primarily read check status and rely on provider CI.

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

- RepoOps exposes idempotent operations used by Implementation Runs:
  - connect repo, ensure branch, apply patch, run verification, open PR, poll checks
- All operations that touch the repo execute within Sandbox jobs.

### Data contracts (if applicable)

- Repo metadata persisted per project:
  - provider, owner/name, default branch, URLs, last indexed SHA
- Indexing metadata persisted per chunk:
  - path, language, commit SHA, offsets, `type=code`

### File-level contracts

- `docs/architecture/spec/SPEC-0017-repo-ops-and-github-integration.md`: canonical RepoOps behavior.
- `docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`: sandbox job building blocks.
- `docs/architecture/adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md`: PR-based GitOps policy.

### Configuration

- GitHub credentials are feature-gated (see `docs/ops/env.md`):
  - `GITHUB_TOKEN` (optional `GITHUB_WEBHOOK_SECRET`)

## Authentication and permissions

### Default credential: Fine-grained PAT

- Use a fine-grained GitHub personal access token (PAT) stored in environment
  variables (`GITHUB_TOKEN`).
- Scope permissions minimally:
  - repository contents: read/write
  - pull requests: read/write
  - workflows/checks: read (for status polling)
  - metadata: read

### Future-compatible: GitHub App

The system should keep a credential-provider interface to allow switching to a
GitHub App without refactoring the run engine.

## Repo connection model

A project can be in one of these states:

1. No repo connected
2. Repo connected (owner/name + default branch)
3. Repo connected + repo indexed (vector namespace exists)

Persist non-secret repo metadata in DB.

## Repo operations

### Create or link repository (FR-022)

- **Link existing**:
  - validate access, fetch default branch, repo URL
- **Create new** (optional later):
  - create repo under configured owner
  - initialize with a standard scaffold

### Branch and checkout workflow

All working copies live inside Vercel Sandbox. The app runtime never executes
repo code.

Sandbox job sequence:

1. `git clone` (or fetch)
2. `git checkout -b <run-branch>`
3. apply patch set (see below)
4. run verification commands
5. commit
6. push branch

Push uses HTTPS. Do not persist tokens into git config beyond the sandbox job
lifespan; redact tokens from logs.

### Patch application

Patch formats supported:

- unified diff
- file-level replace/create operations

Patch application must be:

- atomic per task (either commit cleanly or fail)
- logged (store diff and file list)
- replayable (patch ids in artifacts)

### PR creation and merge

Use GitHub API for:

- create PR from run branch → default branch
- add labels, body template, checklists
- monitor checks/statuses
- merge PR (approval-gated)

### Monitoring checks

Two mechanisms:

- poll GitHub checks/status at bounded intervals (default)
- optional: receive GitHub webhooks for check completion / PR updates

## Repo indexing (FR-032)

Indexing pipeline:

- incremental file walk in sandbox checkout
- ignore patterns:
  - `.git/`, `node_modules/`, build artifacts
  - binary files
- chunk by file:
  - for small files, embed whole file
  - for large files, chunk by lines/sections
- store embeddings in Upstash Vector namespace:
  - `project:{projectId}:repo:{repoId}`
- metadata includes:
  - path
  - language
  - commit SHA
  - chunk offsets
  - `type=code`

Indexing triggers:

- after repo connect (full index)
- after merges (incremental index by changed files)

## Safety and approvals

RepoOps operations are side-effectful and require approval:

- pushing to remote
- merging PRs

All operations persist:

- intent
- parameters (redacted)
- resulting IDs/URLs

## Acceptance criteria

- Repo connect validates access and persists non-secret metadata.
- Patch application is atomic per task and produces replayable artifacts.
- PR creation and merge are approval-gated and respect required checks.
- Repo indexing is project-scoped and ignores secrets/build artifacts.

## Testing

- Unit tests: patch application validation and ignore patterns.
- Integration tests: RepoOps against a dedicated test repo with branch protections.
- Security tests: token redaction and “no secret persistence” invariants.

## Operational notes

- Prefer polling checks with bounded intervals; use webhooks as an optimization.
- Treat merge operations as irreversible side effects; require explicit approval.

## Failure modes and mitigation

- Branch protection blocks merge → surface required checks and stop at merge gate.
- Token lacks scope → fail early with actionable permissions guidance.
- Indexing too slow on large repos → incremental indexing and bounded chunking.

## Key files

- `docs/architecture/spec/SPEC-0017-repo-ops-and-github-integration.md`
- `docs/architecture/adr/ADR-0024-gitops-repository-automation-pr-based-workflows.md`
- `docs/architecture/spec/SPEC-0019-sandbox-build-test-and-ci-execution.md`

## References

- [GitHub REST API](https://docs.github.com/en/rest)
- [GitHub PATs (security)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [Octokit](https://github.com/octokit/octokit.js)
- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)

## Changelog

- **0.1 (2026-02-01)**: Initial draft.
