import "server-only";

import { and, eq, isNull, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

const TERMINAL_RUN_STATUSES = ["canceled", "failed", "succeeded"] as const;

/** Immutable authenticated input for starting a Code Mode run. */
export type CodeModeStartInput = Readonly<{
  budgets?: Readonly<{ maxSteps?: number; timeoutMs?: number }> | undefined;
  networkAccess?: "none" | "restricted" | undefined;
  projectId: string;
  prompt: string;
  runId: string;
  userId: string;
}>;

function toCodeModeMetadata(
  input: CodeModeStartInput,
): Record<string, unknown> {
  return {
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
    networkAccess: input.networkAccess ?? "none",
    origin: "code-mode",
    prompt: input.prompt,
    startedByUserId: input.userId,
  };
}

function matchesStartInput(
  metadata: Record<string, unknown>,
  input: CodeModeStartInput,
): boolean {
  if (
    metadata.origin !== "code-mode" ||
    metadata.prompt !== input.prompt ||
    metadata.startedByUserId !== input.userId ||
    metadata.networkAccess !== (input.networkAccess ?? "none")
  ) {
    return false;
  }

  if (input.budgets === undefined) return metadata.budgets === undefined;
  if (
    typeof metadata.budgets !== "object" ||
    metadata.budgets === null ||
    Array.isArray(metadata.budgets)
  ) {
    return false;
  }
  const budgets = metadata.budgets as Record<string, unknown>;
  return (
    budgets.maxSteps === input.budgets.maxSteps &&
    budgets.timeoutMs === input.budgets.timeoutMs
  );
}

/**
 * Create the client-named Code Mode run exactly once.
 *
 * @remarks
 * The project row lock serializes active-run discovery and insertion, so two
 * different idempotency keys cannot both become active for one project owner.
 * Reusing the same run ID is allowed only with the identical authenticated
 * request.
 *
 * @param input - Authenticated immutable start input and client run UUID.
 * @throws AppError - With code "not_found" when the project does not exist.
 * @throws AppError - With code "conflict" when the run identity differs or another run is active.
 */
export async function ensureCodeModeRun(
  input: CodeModeStartInput,
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
    );
    const [project] = await tx
      .select({
        id: schema.projectsTable.id,
        ownerUserId: schema.projectsTable.ownerUserId,
        status: schema.projectsTable.status,
      })
      .from(schema.projectsTable)
      .where(eq(schema.projectsTable.id, input.projectId))
      .for("update");
    if (!project || project.ownerUserId !== input.userId) {
      throw new AppError("not_found", 404, "Project not found.");
    }
    if (project.status !== "active") {
      throw new AppError(
        "project_not_active",
        409,
        "Restore the project before starting new work.",
      );
    }

    const existing = await tx.query.runsTable.findFirst({
      where: eq(schema.runsTable.id, input.runId),
    });
    if (existing) {
      if (
        existing.projectId !== input.projectId ||
        existing.kind !== "research" ||
        !matchesStartInput(existing.metadata, input)
      ) {
        throw new AppError(
          "conflict",
          409,
          "The Code Mode run ID belongs to a different request.",
        );
      }
      return;
    }

    const [active] = await tx
      .select({ id: schema.runsTable.id })
      .from(schema.runsTable)
      .where(
        and(
          eq(schema.runsTable.projectId, input.projectId),
          notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
          sql`${schema.runsTable.metadata}->>'origin' = 'code-mode'`,
          sql`${schema.runsTable.metadata}->>'startedByUserId' = ${input.userId}`,
        ),
      )
      .limit(1);
    if (active) {
      throw new AppError(
        "conflict",
        409,
        "A Code Mode run is already active for this project.",
      );
    }

    await tx.insert(schema.runsTable).values({
      id: input.runId,
      kind: "research",
      metadata: toCodeModeMetadata(input),
      projectId: input.projectId,
    });
  });
}

/**
 * Atomically register the one Workflow execution allowed to own a Code Mode run.
 *
 * @param runId - Client-known app run UUID.
 * @param workflowRunId - Native Workflow execution ID attempting ownership.
 * @returns `true` for the winner (including an idempotent retry by the same
 * Workflow run), or `false` for a duplicate/terminal/fenced execution.
 */
export async function claimCodeModeWorkflow(
  runId: string,
  workflowRunId: string,
): Promise<boolean> {
  const db = getDb();
  const [claimed] = await db
    .update(schema.runsTable)
    .set({ updatedAt: new Date(), workflowRunId })
    .where(
      and(
        eq(schema.runsTable.id, runId),
        isNull(schema.runsTable.workflowRunId),
        isNull(schema.runsTable.cancelRequestedAt),
        notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
        sql`${schema.runsTable.metadata}->>'origin' = 'code-mode'`,
      ),
    )
    .returning({ id: schema.runsTable.id });
  if (claimed) return true;

  const existing = await db.query.runsTable.findFirst({
    columns: {
      cancelRequestedAt: true,
      metadata: true,
      status: true,
      workflowRunId: true,
    },
    where: eq(schema.runsTable.id, runId),
  });

  return (
    existing?.metadata.origin === "code-mode" &&
    existing.workflowRunId === workflowRunId &&
    existing.cancelRequestedAt === null &&
    !TERMINAL_RUN_STATUSES.some((status) => status === existing.status)
  );
}

/**
 * Find the newest active Code Mode run owned by a project user.
 *
 * @param projectId - Project UUID.
 * @param userId - Authenticated user ID recorded by the start request.
 * @returns Active run UUID, or `null`.
 */
export async function getActiveCodeModeRunId(
  projectId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const row = await db.query.runsTable.findFirst({
    columns: { id: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    where: and(
      eq(schema.runsTable.projectId, projectId),
      notInArray(schema.runsTable.status, [...TERMINAL_RUN_STATUSES]),
      sql`${schema.runsTable.metadata}->>'origin' = 'code-mode'`,
      sql`${schema.runsTable.metadata}->>'startedByUserId' = ${userId}`,
    ),
  });
  return row?.id ?? null;
}
