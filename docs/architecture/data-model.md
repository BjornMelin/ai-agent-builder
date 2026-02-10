# Data Model

Defines canonical relational schema (Neon) and vector indexing model (Upstash
Vector).

The system is intentionally **auditable**: durable runs persist enough metadata
to reconstruct what happened (without persisting secrets).

## Relational entities (target)

Core workspace + research/spec pipeline:

- `projects`
- `project_skills`
- `project_files`
- `file_chunks`
- `runs`
- `run_steps`
- `artifacts`
- `chat_threads`
- `chat_messages`
- `citations`

Implementation/deploy pipeline:

- `repos` (connected target repos; non-secret metadata)
- `approvals` (explicit user approvals for side-effectful actions)
- `deployments` (Vercel deployments; non-secret metadata)
- `infra_resources` (Neon/Upstash resource IDs and non-secret metadata)
- `sandbox_jobs` (sandbox job metadata + transcript refs; no secrets)

> Note: exact table/column naming is flexible; this doc defines the conceptual
> model and required fields.

## Schema locations (repo)

Drizzle is configured for:

- `src/db/schema.ts` (schema definitions)
- `src/db/migrations` (generated migrations)
- `drizzle.config.ts` (drizzle-kit configuration)
- `src/lib/data/*.server.ts` (server-only Data Access Layer; preferred access point)

## Consistency and idempotency

- Neon is authoritative for metadata and artifact versioning.
- Upstash Vector is authoritative for similarity search results.
- Each ingestion run is idempotent per file using content hash (`sha256`) +
  extraction version.
- Each workflow step is idempotent per `(runId, stepId)`.
- Each side-effectful action is idempotent via:
  - a stable internal identifier (e.g. step id)
  - stored external IDs (PR number, deployment id, etc.)

## Entity details (minimum fields)

### `projects`

Project workspace root. Ownership is per authenticated app user.

- `id`
- `owner_user_id` (Neon Auth user id; required)
- `name`
- `slug`
- `status`
- `created_at`, `updated_at`

### `project_skills`

Project-scoped Agent Skills overrides (progressive disclosure).

- `id`
- `project_id`
- `name`
- `name_norm` (unique per project; lowercased/trimmed)
- `description`
- `content` (full SKILL.md markdown; frontmatter optional)
- `metadata` (JSON; reserved)
- `created_at`, `updated_at`

### `repos`

Represents a target repository connected to a project.

- `id`
- `project_id`
- `provider` (enum; initially `github`)
- `owner`
- `name`
- `default_branch`
- `html_url`
- `clone_url`
- `created_at`, `updated_at`

### `approvals`

Records explicit user approvals for side-effectful actions.

- `id`
- `project_id`
- `run_id`
- `step_id` (optional)
- `scope` (repo.push, repo.merge, infra.provision, deploy.production, etc.)
- `intent_summary`
- `approved_at`
- `approved_by` (string; single-user but still recorded)
- `metadata` (JSON; redacted parameters, external IDs)

### `sandbox_jobs`

- `id`
- `project_id`
- `run_id`
- `step_id`
- `job_type` (repo.clone, verify.test, verify.build, etc.)
- `status` (queued/running/succeeded/failed)
- `started_at`, `ended_at`
- `exit_code`
- `transcript_blob_ref` (or stored text with truncation)
- `metadata` (JSON; timings, workspace commit SHA, etc.)

### `infra_resources`

Stores non-secret resource identity + metadata.

- `id`
- `project_id`
- `run_id` (optional; which run created/updated it)
- `provider` (neon, upstash, vercel)
- `resource_type` (db_project, db_branch, redis_db, vector_index, qstash_topic, etc.)
- `external_id`
- `region`
- `metadata` (JSON)
- `created_at`, `updated_at`

### `deployments`

- `id`
- `project_id`
- `run_id`
- `provider` (vercel)
- `vercel_project_id`
- `vercel_deployment_id`
- `deployment_url`
- `status`
- `started_at`, `ended_at`
- `metadata` (JSON; promotion info, commit SHA)

## Vector indexing

Namespaces:

- `project:{projectId}:chunks` — uploaded file chunks
- `project:{projectId}:artifacts` — generated artifacts
- `project:{projectId}:repo:{repoId}` — target repo source code chunks

Vector metadata includes:

- `projectId`
- `type`: `chunk` | `artifact` | `code`
- For chunks:
  - `fileId`, `chunkId`, `pageStart`, `pageEnd`
- For artifacts:
  - `artifactKind`, `artifactKey`, `artifactVersion`
- For code:
  - `repoId`, `path`, `language`, `commitSha`, `chunkStart`, `chunkEnd`

## Artifact versioning

Artifacts are versioned monotonically per logical key:

`(projectId, kind, logicalKey) -> version++`

Implementation artifacts (patchsets, verification, provenance) follow the same
rules (see
[SPEC-0008](./spec/SPEC-0008-artifact-generation-versioning-and-export-zip.md)).

## Required indexes (minimum)

- `project_files(project_id)`
- `projects(owner_user_id, updated_at)`
- `project_skills(project_id, name_norm)`
- `file_chunks(project_id, file_id)`
- `runs(project_id)`
- `run_steps(run_id, step_name)`
- `artifacts(project_id, kind, logical_key)`
- `chat_threads(project_id)`
- `chat_messages(thread_id, created_at)`
- `repos(project_id)`
- `approvals(run_id, scope)`
- `sandbox_jobs(run_id, job_type)`
- `deployments(project_id, status)`
