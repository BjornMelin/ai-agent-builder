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
- `status` (`active`, `archived`, or `deleting`)
- `created_at`, `updated_at`

Project lifecycle mutations require an exact `owner_user_id` match. Archived
projects retain their data and can be restored but cannot start new work.
Deletion atomically claims the project as `deleting`; that state is non-writable,
irreversible, and retryable. Cleanup removes every Blob under
`projects/{projectId}/`, every Vector namespace under `project:{projectId}:`, and
project retrieval-cache keys before the database cascade. The final Blob sweep
cannot begin while a durable `project_upload_grants` row is unexpired, so a
direct-upload capability issued before the deletion claim cannot create a late,
untracked object. `infra_resources` and `deployments` intentionally retain their
original `project_id` without a foreign key, so provider handles and non-secret
provenance survive as detached operational tombstones. Project deletion does
not decommission those external resources; operators use the retained records
for later provider cleanup.

### `project_upload_grants`

Short-lived, signed Vercel Blob client-upload capabilities.

- `id` (embedded in the signed completion payload)
- `project_id`
- `pathname`
- `expires_at`
- `completed_at` (nullable)
- `created_at`

Grant creation shares the active-project advisory lock. Completion marks an
active-project grant settled; completion for an archived/deleting project
deletes the Blob before removing the grant. Deletion remains retryable while a
grant is live, prunes completed/expired grants, then performs a fresh prefix
sweep before the relational cascade.

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

`project_id` is a durable provenance key rather than a foreign key, allowing the
record to survive deletion of the owning app project.

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

`project_id` is a durable provenance key rather than a foreign key, allowing the
record to survive deletion of the owning app project.

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

### `chat_threads`

Project-scoped chat threads backed by Workflow DevKit run IDs.

- `id`
- `project_id`
- `mode` (agent mode id)
- `title`
- `status` (running/waiting/succeeded/failed/canceled)
- `workflow_run_id` (unique; used for resumable stream + follow-ups)
- `last_activity_at`
- `ended_at` (nullable)
- `created_at`, `updated_at`

### `chat_messages`

Persisted UI messages for a thread.

- `id` (AI SDK UI message id; stable across replay)
- `thread_id`
- `role` (user/assistant/system)
- `parts` (JSON array)
  - Stores AI SDK UI parts (text, tool parts, reasoning, etc.).
  - May include document attachments as `FileUIPart` parts (hosted Blob URLs).
- `created_at`

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
