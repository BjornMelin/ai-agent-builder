import "server-only";

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * JSON-safe sandbox job DTO.
 */
export type SandboxJobDto = Readonly<{
  id: string;
  projectId: string;
  runId: string;
  sandboxId: string | null;
  sandboxStopClaimedAt: string | null;
  sandboxStoppedAt: string | null;
  stepId: string | null;
  jobType: string;
  status: string;
  exitCode: number | null;
  transcriptBlobRef: string | null;
  metadata: Record<string, unknown>;
  provisioningClaimedAt: string | null;
  provisioningExpiresAt: string | null;
  provisioningKey: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type SandboxJobRow = typeof schema.sandboxJobsTable.$inferSelect;

/** Durable result of claiming a stable sandbox provisioning operation. */
export type SandboxProvisioningClaim = Readonly<{
  job: SandboxJobDto;
  state: "pending" | "provision" | "reuse" | "terminal";
}>;

/** Durable ownership result for one external sandbox stop. */
export type SandboxStopClaim =
  | Readonly<{ state: "busy" }>
  | Readonly<{ state: "stopped" }>
  | Readonly<{ claimedAt: Date; state: "claimed" }>;

const CANCELABLE_SANDBOX_JOB_STATUSES = [
  "canceling",
  "pending",
  "running",
] as const;
const IMMUTABLE_SANDBOX_JOB_STATUSES = [
  "canceling",
  "canceled",
  "failed",
  "succeeded",
] as const;

function isImmutableSandboxJobStatus(status: string): boolean {
  return IMMUTABLE_SANDBOX_JOB_STATUSES.some(
    (immutableStatus) => status === immutableStatus,
  );
}

function toSandboxJobDto(row: SandboxJobRow): SandboxJobDto {
  return {
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    exitCode: row.exitCode ?? null,
    id: row.id,
    jobType: row.jobType,
    metadata: row.metadata,
    projectId: row.projectId,
    provisioningClaimedAt: row.provisioningClaimedAt
      ? row.provisioningClaimedAt.toISOString()
      : null,
    provisioningExpiresAt: row.provisioningExpiresAt
      ? row.provisioningExpiresAt.toISOString()
      : null,
    provisioningKey: row.provisioningKey ?? null,
    runId: row.runId,
    sandboxId: row.sandboxId ?? null,
    sandboxStopClaimedAt: row.sandboxStopClaimedAt
      ? row.sandboxStopClaimedAt.toISOString()
      : null,
    sandboxStoppedAt: row.sandboxStoppedAt
      ? row.sandboxStoppedAt.toISOString()
      : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
    stepId: row.stepId ?? null,
    transcriptBlobRef: row.transcriptBlobRef ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds);
}

function isTerminalSandboxJobStatus(status: string): boolean {
  return status === "canceled" || status === "failed" || status === "succeeded";
}

/**
 * Create a sandbox job record.
 *
 * @param input - Job creation payload.
 * @returns Created job DTO.
 */
export async function createSandboxJob(
  input: Readonly<{
    projectId: string;
    runId: string;
    jobType: string;
    status: string;
    metadata?: Record<string, unknown>;
    sandboxId?: string | null;
    stepId?: string | null;
  }>,
): Promise<SandboxJobDto> {
  const db = getDb();
  try {
    const row = await db.transaction(async (tx) => {
      const [run] = await tx
        .select({
          cancelRequestedAt: schema.runsTable.cancelRequestedAt,
          status: schema.runsTable.status,
        })
        .from(schema.runsTable)
        .where(eq(schema.runsTable.id, input.runId))
        .for("update");

      if (!run) {
        throw new AppError("not_found", 404, "Run not found.");
      }
      if (run.cancelRequestedAt || run.status === "canceled") {
        throw new AppError(
          "sandbox_job_canceled",
          409,
          "Run cancellation prevents new sandbox jobs.",
        );
      }
      if (run.status === "failed" || run.status === "succeeded") {
        throw new AppError(
          "run_not_active",
          409,
          "Run is not accepting new sandbox jobs.",
        );
      }

      const [created] = await tx
        .insert(schema.sandboxJobsTable)
        .values({
          jobType: input.jobType,
          metadata: input.metadata ?? {},
          projectId: input.projectId,
          runId: input.runId,
          ...(input.sandboxId === undefined
            ? {}
            : { sandboxId: input.sandboxId }),
          status: input.status,
          ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
        })
        .returning();

      return created;
    });

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create sandbox job.",
      );
    }

    return toSandboxJobDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Claim one stable sandbox provisioning operation for a durable workflow step.
 *
 * @remarks
 * The run row lock serializes cancellation, first creation, and retries. A
 * retry reuses the same job. If an earlier provider response may have been
 * lost, no replacement may be provisioned until its recorded provider TTL
 * window has expired according to the database clock.
 *
 * @param input - Stable provisioning identity and provider lifetime bounds.
 * @returns The existing job and the action the caller may safely take.
 */
export async function claimSandboxJobProvisioning(
  input: Readonly<{
    createTimeoutMs: number;
    jobType: string;
    metadata?: Record<string, unknown>;
    projectId: string;
    provisioningKey: string;
    runId: string;
    stepId?: string | null;
    timeoutMs: number;
  }>,
): Promise<SandboxProvisioningClaim> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [run] = await tx
        .select({
          cancelRequestedAt: schema.runsTable.cancelRequestedAt,
          databaseNow: sql<Date>`now()`,
          status: schema.runsTable.status,
        })
        .from(schema.runsTable)
        .where(eq(schema.runsTable.id, input.runId))
        .for("update");

      if (!run) {
        throw new AppError("not_found", 404, "Run not found.");
      }

      const existing = await tx.query.sandboxJobsTable.findFirst({
        where: and(
          eq(schema.sandboxJobsTable.runId, input.runId),
          eq(schema.sandboxJobsTable.provisioningKey, input.provisioningKey),
        ),
      });

      if (run.cancelRequestedAt || run.status === "canceled") {
        throw new AppError(
          "sandbox_job_canceled",
          409,
          "Run cancellation prevents sandbox provisioning.",
        );
      }
      if (run.status === "failed" || run.status === "succeeded") {
        throw new AppError(
          "run_not_active",
          409,
          "Run is not accepting sandbox provisioning.",
        );
      }

      if (existing?.sandboxId) {
        return {
          job: toSandboxJobDto(existing),
          state:
            existing.sandboxStoppedAt ||
            isTerminalSandboxJobStatus(existing.status)
              ? "terminal"
              : "reuse",
        };
      }

      if (existing && isTerminalSandboxJobStatus(existing.status)) {
        return { job: toSandboxJobDto(existing), state: "terminal" };
      }

      if (
        existing?.provisioningExpiresAt &&
        existing.provisioningExpiresAt.getTime() > run.databaseNow.getTime()
      ) {
        return { job: toSandboxJobDto(existing), state: "pending" };
      }

      const provisioningExpiresAt = addMilliseconds(
        run.databaseNow,
        input.createTimeoutMs + input.timeoutMs,
      );

      if (existing) {
        const [reclaimed] = await tx
          .update(schema.sandboxJobsTable)
          .set({
            provisioningClaimedAt: run.databaseNow,
            provisioningExpiresAt,
            updatedAt: run.databaseNow,
          })
          .where(eq(schema.sandboxJobsTable.id, existing.id))
          .returning();
        if (!reclaimed) {
          throw new AppError(
            "db_update_failed",
            500,
            "Failed to reclaim sandbox provisioning.",
          );
        }
        return { job: toSandboxJobDto(reclaimed), state: "provision" };
      }

      const [created] = await tx
        .insert(schema.sandboxJobsTable)
        .values({
          jobType: input.jobType,
          metadata: input.metadata ?? {},
          projectId: input.projectId,
          provisioningClaimedAt: run.databaseNow,
          provisioningExpiresAt,
          provisioningKey: input.provisioningKey,
          runId: input.runId,
          status: "pending",
          ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
          updatedAt: run.databaseNow,
        })
        .returning();

      if (!created) {
        throw new AppError(
          "db_insert_failed",
          500,
          "Failed to create sandbox provisioning job.",
        );
      }
      return { job: toSandboxJobDto(created), state: "provision" };
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Publish a provisioned sandbox and activate its durable job.
 *
 * @remarks
 * The row lock serializes activation with cancellation. If cancellation has
 * already claimed the job, the sandbox ID is still published while the
 * `canceling` state is preserved so the runner or a retry can stop it.
 *
 * @param jobId - Sandbox job ID.
 * @param input - Provisioned sandbox identity and runtime metadata.
 * @returns Current durable job state.
 */
export async function activateSandboxJob(
  jobId: string,
  input: Readonly<{
    sandboxId: string;
    metadata?: Record<string, unknown>;
    startedAt: Date;
  }>,
): Promise<SandboxJobDto> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.sandboxJobsTable)
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .for("update");

      if (!existing) {
        throw new AppError("not_found", 404, "Sandbox job not found.");
      }
      if (existing.sandboxId && existing.sandboxId !== input.sandboxId) {
        throw new AppError(
          "sandbox_ownership_conflict",
          409,
          "Sandbox job already owns another sandbox.",
        );
      }
      if (existing.status !== "pending" && existing.status !== "canceling") {
        return toSandboxJobDto(existing);
      }

      const now = new Date();
      const [row] = await tx
        .update(schema.sandboxJobsTable)
        .set({
          metadata: input.metadata
            ? { ...existing.metadata, ...input.metadata }
            : existing.metadata,
          provisioningClaimedAt: null,
          provisioningExpiresAt: null,
          sandboxId: input.sandboxId,
          startedAt: input.startedAt,
          status: existing.status === "pending" ? "running" : "canceling",
          updatedAt: now,
        })
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .returning();

      if (!row) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to activate sandbox job.",
        );
      }
      return toSandboxJobDto(row);
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Publish external sandbox ownership without changing the durable job status.
 *
 * @remarks
 * This narrow write is the activation-failure recovery path. It is permitted
 * for terminal jobs because terminal status is immutable while external
 * resource ownership still must never be lost.
 *
 * @param jobId - Durable sandbox job ID.
 * @param sandboxId - Provider sandbox ID.
 * @returns Current durable job state.
 */
export async function publishSandboxJobOwnership(
  jobId: string,
  sandboxId: string,
): Promise<SandboxJobDto> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.sandboxJobsTable)
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .for("update");
      if (!existing) {
        throw new AppError("not_found", 404, "Sandbox job not found.");
      }
      if (existing.sandboxId && existing.sandboxId !== sandboxId) {
        throw new AppError(
          "sandbox_ownership_conflict",
          409,
          "Sandbox job already owns another sandbox.",
        );
      }
      if (existing.sandboxId === sandboxId) return toSandboxJobDto(existing);

      const [published] = await tx
        .update(schema.sandboxJobsTable)
        .set({
          provisioningClaimedAt: null,
          provisioningExpiresAt: null,
          sandboxId,
          updatedAt: new Date(),
        })
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .returning();
      if (!published) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to publish sandbox ownership.",
        );
      }
      return toSandboxJobDto(published);
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Record a directly stopped sandbox after ownership publication was unavailable.
 *
 * @param jobId - Durable sandbox job ID.
 * @param sandboxId - Provider sandbox ID.
 * @param stoppedAt - Confirmed stop timestamp.
 * @returns Updated durable job state.
 */
export async function recordSandboxStoppedForJob(
  jobId: string,
  sandboxId: string,
  stoppedAt: Date,
): Promise<SandboxJobDto> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.sandboxJobsTable)
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .for("update");
      if (!existing) {
        throw new AppError("not_found", 404, "Sandbox job not found.");
      }
      if (existing.sandboxId && existing.sandboxId !== sandboxId) {
        throw new AppError(
          "sandbox_ownership_conflict",
          409,
          "Sandbox job already owns another sandbox.",
        );
      }

      const [recorded] = await tx
        .update(schema.sandboxJobsTable)
        .set({
          ...(existing.status === "canceling"
            ? { endedAt: stoppedAt, status: "canceled" }
            : {}),
          provisioningClaimedAt: null,
          provisioningExpiresAt: null,
          sandboxId,
          sandboxStopClaimedAt: null,
          sandboxStoppedAt: stoppedAt,
          updatedAt: stoppedAt,
        })
        .where(eq(schema.sandboxJobsTable.id, jobId))
        .returning();
      if (!recorded) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to record stopped sandbox ownership.",
        );
      }
      return toSandboxJobDto(recorded);
    });
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Get a sandbox job by ID.
 *
 * @param jobId - Job ID.
 * @returns Job DTO or null.
 */
export const getSandboxJobById = cache(
  async (jobId: string): Promise<SandboxJobDto | null> => {
    const db = getDb();
    try {
      const row = await db.query.sandboxJobsTable.findFirst({
        where: eq(schema.sandboxJobsTable.id, jobId),
      });
      return row ? toSandboxJobDto(row) : null;
    } catch (err) {
      throw maybeWrapDbNotMigrated(err);
    }
  },
);

/**
 * List sandbox jobs for a run ordered by creation time.
 *
 * @param runId - Run ID.
 * @returns Job DTOs.
 */
export const listSandboxJobsByRun = cache(
  async (runId: string): Promise<SandboxJobDto[]> => {
    const db = getDb();
    try {
      const rows = await db.query.sandboxJobsTable.findMany({
        orderBy: (t) => [asc(t.createdAt)],
        where: eq(schema.sandboxJobsTable.runId, runId),
      });
      return rows.map(toSandboxJobDto);
    } catch (err) {
      throw maybeWrapDbNotMigrated(err);
    }
  },
);

/**
 * Resolve the durable run that owns a provider sandbox.
 *
 * @param sandboxId - Provider sandbox ID.
 * @returns Owning run ID or null when ownership was never published.
 */
export async function getSandboxOwnerRunId(
  sandboxId: string,
): Promise<string | null> {
  const db = getDb();
  try {
    const row = await db.query.sandboxJobsTable.findFirst({
      columns: { runId: true },
      where: eq(schema.sandboxJobsTable.sandboxId, sandboxId),
    });
    return row?.runId ?? null;
  } catch (error) {
    throw maybeWrapDbNotMigrated(error);
  }
}

/**
 * Atomically claim a run's active sandbox jobs for cancellation.
 *
 * @remarks
 * `canceling` is a retryable lock state. A concurrent runner either finishes
 * its transition first (so its latest sandbox ID is returned here) or observes
 * the lock and cleans up the sandbox it just provisioned.
 *
 * @param runId - Run ID.
 * @returns Every job owned by the run, including terminal jobs that may still
 * own a shared sandbox.
 */
export async function claimSandboxJobsForCancellation(
  runId: string,
): Promise<SandboxJobDto[]> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [clock] = await tx
        .select({ databaseNow: sql<Date>`now()` })
        .from(schema.runsTable)
        .where(eq(schema.runsTable.id, runId))
        .for("update");
      if (!clock) {
        throw new AppError("not_found", 404, "Run not found.");
      }

      await tx
        .update(schema.sandboxJobsTable)
        .set({ status: "canceling", updatedAt: clock.databaseNow })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            inArray(schema.sandboxJobsTable.status, [
              ...CANCELABLE_SANDBOX_JOB_STATUSES,
            ]),
          ),
        );

      await tx
        .update(schema.sandboxJobsTable)
        .set({
          endedAt: clock.databaseNow,
          status: "canceled",
          updatedAt: clock.databaseNow,
        })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.status, "canceling"),
            isNotNull(schema.sandboxJobsTable.sandboxStoppedAt),
          ),
        );

      await tx
        .update(schema.sandboxJobsTable)
        .set({
          endedAt: clock.databaseNow,
          status: "canceled",
          updatedAt: clock.databaseNow,
        })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.status, "canceling"),
            isNull(schema.sandboxJobsTable.sandboxId),
            isNotNull(schema.sandboxJobsTable.provisioningExpiresAt),
            lte(
              schema.sandboxJobsTable.provisioningExpiresAt,
              clock.databaseNow,
            ),
          ),
        );

      const rows = await tx
        .select()
        .from(schema.sandboxJobsTable)
        .where(eq(schema.sandboxJobsTable.runId, runId))
        .orderBy(asc(schema.sandboxJobsTable.createdAt));
      return rows.map(toSandboxJobDto);
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Acquire the expiring external-stop claim for a run-owned sandbox.
 *
 * @param runId - Run ID.
 * @param sandboxId - Sandbox ID.
 * @param leaseMs - Duration before an abandoned claim may be replaced.
 * @returns Whether this caller owns the stop, another caller owns it, or the
 * sandbox was already confirmed stopped.
 */
export async function claimSandboxStopForRun(
  runId: string,
  sandboxId: string,
  leaseMs: number,
): Promise<SandboxStopClaim> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          databaseNow: sql<Date>`now()`,
          sandboxStopClaimedAt: schema.sandboxJobsTable.sandboxStopClaimedAt,
          sandboxStoppedAt: schema.sandboxJobsTable.sandboxStoppedAt,
        })
        .from(schema.sandboxJobsTable)
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.sandboxId, sandboxId),
          ),
        )
        .for("update");

      if (rows.length === 0) {
        throw new AppError("not_found", 404, "Sandbox ownership not found.");
      }
      if (rows.every((row) => row.sandboxStoppedAt !== null)) {
        return { state: "stopped" };
      }
      const databaseNow = rows[0]?.databaseNow;
      if (!databaseNow) {
        throw new AppError(
          "db_select_failed",
          500,
          "Failed to read the database clock.",
        );
      }
      const staleBefore = addMilliseconds(databaseNow, -leaseMs);
      if (
        rows.some(
          (row) =>
            row.sandboxStopClaimedAt &&
            row.sandboxStopClaimedAt.getTime() > staleBefore.getTime(),
        )
      ) {
        return { state: "busy" };
      }

      await tx
        .update(schema.sandboxJobsTable)
        .set({
          sandboxStopClaimedAt: databaseNow,
          updatedAt: databaseNow,
        })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.sandboxId, sandboxId),
          ),
        );
      return { claimedAt: databaseNow, state: "claimed" };
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Release an external-stop claim after an unconfirmed stop attempt.
 *
 * @param runId - Run ID.
 * @param sandboxId - Sandbox ID.
 * @param claimedAt - Exact claim timestamp owned by this caller.
 */
export async function releaseSandboxStopForRun(
  runId: string,
  sandboxId: string,
  claimedAt: Date,
): Promise<void> {
  const db = getDb();
  try {
    await db
      .update(schema.sandboxJobsTable)
      .set({ sandboxStopClaimedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.sandboxJobsTable.runId, runId),
          eq(schema.sandboxJobsTable.sandboxId, sandboxId),
          eq(schema.sandboxJobsTable.sandboxStopClaimedAt, claimedAt),
        ),
      );
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Persist confirmed shutdown for one run-owned sandbox.
 *
 * @remarks
 * All jobs that reference a shared sandbox receive the durable resource marker;
 * claimed jobs become terminal only after that marker is committed.
 *
 * @param runId - Run ID.
 * @param sandboxId - Confirmed stopped sandbox ID.
 * @param stoppedAt - Confirmation timestamp.
 */
export async function confirmSandboxStoppedForRun(
  runId: string,
  sandboxId: string,
  stoppedAt: Date,
): Promise<void> {
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.sandboxJobsTable)
        .set({
          sandboxStopClaimedAt: null,
          sandboxStoppedAt: stoppedAt,
          updatedAt: stoppedAt,
        })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.sandboxId, sandboxId),
          ),
        );

      await tx
        .update(schema.sandboxJobsTable)
        .set({ endedAt: stoppedAt, status: "canceled", updatedAt: stoppedAt })
        .where(
          and(
            eq(schema.sandboxJobsTable.runId, runId),
            eq(schema.sandboxJobsTable.sandboxId, sandboxId),
            eq(schema.sandboxJobsTable.status, "canceling"),
          ),
        );
    });
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Complete cancellation for claimed sandbox jobs.
 *
 * @param jobIds - Claimed sandbox job IDs.
 * @param endedAt - Timestamp after external sandbox shutdown completed.
 */
export async function completeSandboxJobCancellation(
  jobIds: readonly string[],
  endedAt: Date,
): Promise<void> {
  if (jobIds.length === 0) return;

  const db = getDb();
  try {
    await db
      .update(schema.sandboxJobsTable)
      .set({ endedAt, status: "canceled", updatedAt: endedAt })
      .where(
        and(
          inArray(schema.sandboxJobsTable.id, [...jobIds]),
          eq(schema.sandboxJobsTable.status, "canceling"),
        ),
      );
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Update a sandbox job record.
 *
 * @param jobId - Job ID.
 * @param patch - Mutable fields to update.
 * @returns Updated job DTO.
 * @throws AppError - With code "not_found" when job does not exist.
 */
export async function updateSandboxJob(
  jobId: string,
  patch: Readonly<{
    status?: string;
    metadata?: Record<string, unknown>;
    startedAt?: Date | null;
    endedAt?: Date | null;
    exitCode?: number | null;
    transcriptBlobRef?: string | null;
  }>,
): Promise<SandboxJobDto> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await db.query.sandboxJobsTable.findFirst({
      where: eq(schema.sandboxJobsTable.id, jobId),
    });
    if (!existing) {
      throw new AppError("not_found", 404, "Sandbox job not found.");
    }
    if (isImmutableSandboxJobStatus(existing.status)) {
      return toSandboxJobDto(existing);
    }

    const nextMetadata = patch.metadata
      ? { ...existing.metadata, ...patch.metadata }
      : existing.metadata;

    const [row] = await db
      .update(schema.sandboxJobsTable)
      .set({
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.startedAt === undefined
          ? {}
          : { startedAt: patch.startedAt }),
        ...(patch.endedAt === undefined ? {} : { endedAt: patch.endedAt }),
        ...(patch.exitCode === undefined ? {} : { exitCode: patch.exitCode }),
        ...(patch.transcriptBlobRef === undefined
          ? {}
          : { transcriptBlobRef: patch.transcriptBlobRef }),
        metadata: nextMetadata,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.sandboxJobsTable.id, jobId),
          notInArray(schema.sandboxJobsTable.status, [
            ...IMMUTABLE_SANDBOX_JOB_STATUSES,
          ]),
        ),
      )
      .returning();

    if (!row) {
      const current = await db.query.sandboxJobsTable.findFirst({
        where: eq(schema.sandboxJobsTable.id, jobId),
      });
      if (current && isImmutableSandboxJobStatus(current.status)) {
        return toSandboxJobDto(current);
      }
      throw new AppError(
        "db_update_failed",
        500,
        "Failed to update sandbox job.",
      );
    }

    return toSandboxJobDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
