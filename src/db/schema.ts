import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm/relations";

/**
 * Run kind describes the end-to-end workflow type.
 *
 * - `research`: research → artifacts
 * - `implementation`: plan → code → verify → deploy
 */
export const runKindEnum = pgEnum("run_kind", ["research", "implementation"]);

/**
 * Run/step status is the canonical state machine status for durable workflows.
 *
 * Source of truth: docs/architecture/spec/SPEC-0005-durable-runs-orchestration.md
 */
export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "waiting",
  "blocked",
  "succeeded",
  "failed",
  "canceled",
]);

/**
 * Step kind describes the execution mode of a step in the workflow DAG.
 */
export const runStepKindEnum = pgEnum("run_step_kind", [
  "llm",
  "tool",
  "sandbox",
  "wait",
  "approval",
  "external_poll",
]);

/**
 * Connected repository providers.
 */
export const repoProviderEnum = pgEnum("repo_provider", ["github"]);

/**
 * Provider names for infra resources and deployments.
 */
export const providerEnum = pgEnum("provider", ["neon", "upstash", "vercel"]);

/**
 * Project workspace.
 */
export const projectsTable = pgTable(
  "projects",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    status: text("status").notNull().default("active"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_slug_unique").on(t.slug),
    index("projects_status_idx").on(t.status),
  ],
);

/**
 * Uploaded files belonging to a project (originals).
 */
export const projectFilesTable = pgTable(
  "project_files",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    mimeType: text("mime_type").notNull(),
    name: text("name").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
  },
  (t) => [
    index("project_files_project_id_idx").on(t.projectId),
    uniqueIndex("project_files_project_id_sha256_unique").on(
      t.projectId,
      t.sha256,
    ),
  ],
);

/**
 * Extracted, chunked text used for retrieval and provenance.
 */
export const fileChunksTable = pgTable(
  "file_chunks",
  {
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => projectFilesTable.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    pageEnd: integer("page_end"),
    pageStart: integer("page_start"),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    tokenCount: integer("token_count"),
  },
  (t) => [
    index("file_chunks_project_id_file_id_idx").on(t.projectId, t.fileId),
    uniqueIndex("file_chunks_file_id_chunk_index_unique").on(
      t.fileId,
      t.chunkIndex,
    ),
  ],
);

/**
 * A durable run is the canonical record for orchestrated workflows.
 */
export const runsTable = pgTable(
  "runs",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: runKindEnum("kind").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Workflow DevKit run ID backing this durable run (used for streaming/cancel).
     *
     * @remarks
     * Nullable for historical rows (pre-migration) and for runs created but not
     * yet started successfully.
     */
    workflowRunId: varchar("workflow_run_id", { length: 128 }),
  },
  (t) => [
    index("runs_project_id_idx").on(t.projectId),
    uniqueIndex("runs_workflow_run_id_unique").on(t.workflowRunId),
  ],
);

/**
 * Run steps represent execution in the run DAG (idempotent per runId+stepId).
 */
export const runStepsTable = pgTable(
  "run_steps",
  {
    attempt: integer("attempt").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    error: jsonb("error").$type<Record<string, unknown>>(),
    id: uuid("id").primaryKey().defaultRandom(),
    inputs: jsonb("inputs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    outputs: jsonb("outputs")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    runId: uuid("run_id")
      .notNull()
      .references(() => runsTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: runStatusEnum("status").notNull().default("pending"),
    stepId: varchar("step_id", { length: 128 }).notNull(),
    stepKind: runStepKindEnum("step_kind").notNull(),
    stepName: text("step_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("run_steps_run_id_idx").on(t.runId),
    uniqueIndex("run_steps_run_id_step_id_unique").on(t.runId, t.stepId),
    index("run_steps_run_id_step_name_idx").on(t.runId, t.stepName),
  ],
);

/**
 * Versioned artifacts produced by runs (PRD/ADR/specs, provenance, patchsets, etc.).
 */
export const artifactsTable = pgTable(
  "artifacts",
  {
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 64 }).notNull(),
    logicalKey: varchar("logical_key", { length: 256 }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => runsTable.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull(),
  },
  (t) => [
    index("artifacts_project_id_idx").on(t.projectId),
    index("artifacts_project_id_kind_key_idx").on(
      t.projectId,
      t.kind,
      t.logicalKey,
    ),
    uniqueIndex("artifacts_project_id_kind_key_version_unique").on(
      t.projectId,
      t.kind,
      t.logicalKey,
      t.version,
    ),
  ],
);

/**
 * Citations support auditable research outputs.
 */
export const citationsTable = pgTable(
  "citations",
  {
    artifactId: uuid("artifact_id").references(() => artifactsTable.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    sourceRef: text("source_ref").notNull(),
    sourceType: varchar("source_type", { length: 64 }).notNull(),
  },
  (t) => [index("citations_project_id_idx").on(t.projectId)],
);

/**
 * Project chat threads.
 */
export const chatThreadsTable = pgTable(
  "chat_threads",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_threads_project_id_idx").on(t.projectId)],
);

/**
 * Messages within a chat thread.
 */
export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    role: varchar("role", { length: 32 }).notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("chat_messages_thread_id_created_at_idx").on(t.threadId, t.createdAt),
  ],
);

/**
 * Connected target repositories (non-secret metadata only).
 */
export const reposTable = pgTable(
  "repos",
  {
    cloneUrl: text("clone_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    defaultBranch: text("default_branch").notNull(),
    htmlUrl: text("html_url").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    provider: repoProviderEnum("provider").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("repos_project_id_idx").on(t.projectId)],
);

/**
 * Explicit approvals for side-effectful actions.
 */
export const approvalsTable = pgTable(
  "approvals",
  {
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey().defaultRandom(),
    intentSummary: text("intent_summary").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => runsTable.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 128 }).notNull(),
    stepId: uuid("step_id").references(() => runStepsTable.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("approvals_run_id_scope_idx").on(t.runId, t.scope)],
);

/**
 * Vercel deployments (non-secret metadata only).
 */
export const deploymentsTable = pgTable(
  "deployments",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deploymentUrl: text("deployment_url"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    id: uuid("id").primaryKey().defaultRandom(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull().default("vercel"),
    runId: uuid("run_id").references(() => runsTable.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    vercelDeploymentId: text("vercel_deployment_id"),
    vercelProjectId: text("vercel_project_id"),
  },
  (t) => [index("deployments_project_id_status_idx").on(t.projectId, t.status)],
);

/**
 * External infra resources (Neon/Upstash/Vercel) recorded for provenance.
 */
export const infraResourcesTable = pgTable(
  "infra_resources",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    externalId: text("external_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    region: text("region"),
    resourceType: varchar("resource_type", { length: 128 }).notNull(),
    runId: uuid("run_id").references(() => runsTable.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("infra_resources_project_id_idx").on(t.projectId)],
);

/**
 * Vercel Sandbox jobs (non-secret metadata only).
 */
export const sandboxJobsTable = pgTable(
  "sandbox_jobs",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: varchar("job_type", { length: 128 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => runsTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull(),
    stepId: uuid("step_id").references(() => runStepsTable.id, {
      onDelete: "set null",
    }),
    transcriptBlobRef: text("transcript_blob_ref"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sandbox_jobs_run_id_job_type_idx").on(t.runId, t.jobType)],
);

/**
 * Project relations for Drizzle query helpers.
 */
export const projectsRelations = relations(projectsTable, ({ many }) => ({
  artifacts: many(artifactsTable),
  chatThreads: many(chatThreadsTable),
  files: many(projectFilesTable),
  repos: many(reposTable),
  runs: many(runsTable),
}));

/**
 * Project file relations for Drizzle query helpers.
 */
export const projectFilesRelations = relations(
  projectFilesTable,
  ({ one, many }) => ({
    chunks: many(fileChunksTable),
    project: one(projectsTable, {
      fields: [projectFilesTable.projectId],
      references: [projectsTable.id],
    }),
  }),
);

/**
 * File chunk relations for Drizzle query helpers.
 */
export const fileChunksRelations = relations(fileChunksTable, ({ one }) => ({
  file: one(projectFilesTable, {
    fields: [fileChunksTable.fileId],
    references: [projectFilesTable.id],
  }),
  project: one(projectsTable, {
    fields: [fileChunksTable.projectId],
    references: [projectsTable.id],
  }),
}));

/**
 * Run relations for Drizzle query helpers.
 */
export const runsRelations = relations(runsTable, ({ one, many }) => ({
  artifacts: many(artifactsTable),
  project: one(projectsTable, {
    fields: [runsTable.projectId],
    references: [projectsTable.id],
  }),
  steps: many(runStepsTable),
}));

/**
 * Run step relations for Drizzle query helpers.
 */
export const runStepsRelations = relations(runStepsTable, ({ one, many }) => ({
  approvals: many(approvalsTable),
  run: one(runsTable, {
    fields: [runStepsTable.runId],
    references: [runsTable.id],
  }),
  sandboxJobs: many(sandboxJobsTable),
}));

/**
 * Artifact relations for Drizzle query helpers.
 */
export const artifactsRelations = relations(
  artifactsTable,
  ({ one, many }) => ({
    citations: many(citationsTable),
    project: one(projectsTable, {
      fields: [artifactsTable.projectId],
      references: [projectsTable.id],
    }),
    run: one(runsTable, {
      fields: [artifactsTable.runId],
      references: [runsTable.id],
    }),
  }),
);

/**
 * Citation relations for Drizzle query helpers.
 */
export const citationsRelations = relations(citationsTable, ({ one }) => ({
  artifact: one(artifactsTable, {
    fields: [citationsTable.artifactId],
    references: [artifactsTable.id],
  }),
  project: one(projectsTable, {
    fields: [citationsTable.projectId],
    references: [projectsTable.id],
  }),
}));

/**
 * Chat thread relations for Drizzle query helpers.
 */
export const chatThreadsRelations = relations(
  chatThreadsTable,
  ({ one, many }) => ({
    messages: many(chatMessagesTable),
    project: one(projectsTable, {
      fields: [chatThreadsTable.projectId],
      references: [projectsTable.id],
    }),
  }),
);

/**
 * Chat message relations for Drizzle query helpers.
 */
export const chatMessagesRelations = relations(
  chatMessagesTable,
  ({ one }) => ({
    thread: one(chatThreadsTable, {
      fields: [chatMessagesTable.threadId],
      references: [chatThreadsTable.id],
    }),
  }),
);

/**
 * Repo relations for Drizzle query helpers.
 */
export const reposRelations = relations(reposTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [reposTable.projectId],
    references: [projectsTable.id],
  }),
}));

/**
 * Approval relations for Drizzle query helpers.
 */
export const approvalsRelations = relations(approvalsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [approvalsTable.projectId],
    references: [projectsTable.id],
  }),
  run: one(runsTable, {
    fields: [approvalsTable.runId],
    references: [runsTable.id],
  }),
  step: one(runStepsTable, {
    fields: [approvalsTable.stepId],
    references: [runStepsTable.id],
  }),
}));

/**
 * Deployment relations for Drizzle query helpers.
 */
export const deploymentsRelations = relations(deploymentsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [deploymentsTable.projectId],
    references: [projectsTable.id],
  }),
  run: one(runsTable, {
    fields: [deploymentsTable.runId],
    references: [runsTable.id],
  }),
}));

/**
 * Infra resource relations for Drizzle query helpers.
 */
export const infraResourcesRelations = relations(
  infraResourcesTable,
  ({ one }) => ({
    project: one(projectsTable, {
      fields: [infraResourcesTable.projectId],
      references: [projectsTable.id],
    }),
    run: one(runsTable, {
      fields: [infraResourcesTable.runId],
      references: [runsTable.id],
    }),
  }),
);

/**
 * Sandbox job relations for Drizzle query helpers.
 */
export const sandboxJobsRelations = relations(sandboxJobsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [sandboxJobsTable.projectId],
    references: [projectsTable.id],
  }),
  run: one(runsTable, {
    fields: [sandboxJobsTable.runId],
    references: [runsTable.id],
  }),
  step: one(runStepsTable, {
    fields: [sandboxJobsTable.stepId],
    references: [runStepsTable.id],
  }),
}));

/**
 * Type helpers for consumers.
 */
export type Project = typeof projectsTable.$inferSelect;
/**
 * Insert shape for creating a project.
 */
export type NewProject = typeof projectsTable.$inferInsert;
