import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagApprovalsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * JSON-safe approval DTO.
 */
export type ApprovalDto = Readonly<{
  id: string;
  projectId: string;
  runId: string;
  /**
   * Optional run step row ID (UUID) that triggered this approval.
   */
  stepId: string | null;
  scope: string;
  intentSummary: string;
  metadata: Record<string, unknown>;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
}>;

type ApprovalRow = typeof schema.approvalsTable.$inferSelect;

function toApprovalDto(row: ApprovalRow): ApprovalDto {
  return {
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvedBy: row.approvedBy ?? null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    intentSummary: row.intentSummary,
    metadata: row.metadata,
    projectId: row.projectId,
    runId: row.runId,
    scope: row.scope,
    stepId: row.stepId ?? null,
  };
}

/**
 * Fetch a single approval row by ID.
 *
 * @param approvalId - Approval ID.
 * @returns Approval DTO or null.
 */
export async function getApprovalById(
  approvalId: string,
): Promise<ApprovalDto | null> {
  const db = getDb();
  try {
    const row = await db.query.approvalsTable.findFirst({
      where: eq(schema.approvalsTable.id, approvalId),
    });
    return row ? toApprovalDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * List pending approvals for a project (optionally filtered by run).
 *
 * @param projectId - Project ID.
 * @param options - Optional filters.
 * @returns Pending approvals ordered oldest-first.
 */
export async function listPendingApprovals(
  projectId: string,
  options: Readonly<{ runId?: string; limit?: number }> = {},
): Promise<ApprovalDto[]> {
  "use cache";

  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  cacheLife("minutes");
  cacheTag(tagApprovalsIndex(projectId));

  const db = getDb();
  try {
    const rows = await db.query.approvalsTable.findMany({
      limit,
      orderBy: (t) => [asc(t.createdAt)],
      where: and(
        eq(schema.approvalsTable.projectId, projectId),
        isNull(schema.approvalsTable.approvedAt),
        ...(options.runId
          ? [eq(schema.approvalsTable.runId, options.runId)]
          : []),
      ),
    });
    return rows.map(toApprovalDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Create an approval request (idempotent per run+scope when still pending).
 *
 * @remarks
 * This is used by workflow steps to request explicit user approval for
 * side-effectful actions.
 *
 * @param input - Approval request inputs.
 * @returns Existing pending approval or newly created approval.
 */
export async function createApprovalRequest(
  input: Readonly<{
    projectId: string;
    runId: string;
    scope: string;
    intentSummary: string;
    metadata?: Record<string, unknown>;
    stepId?: string | null;
  }>,
): Promise<ApprovalDto> {
  const db = getDb();
  try {
    const existing = await db.query.approvalsTable.findFirst({
      orderBy: (t) => [asc(t.createdAt)],
      where: and(
        eq(schema.approvalsTable.projectId, input.projectId),
        eq(schema.approvalsTable.runId, input.runId),
        eq(schema.approvalsTable.scope, input.scope),
        isNull(schema.approvalsTable.approvedAt),
      ),
    });
    if (existing) {
      return toApprovalDto(existing);
    }

    const [row] = await db
      .insert(schema.approvalsTable)
      .values({
        approvedAt: null,
        approvedBy: null,
        intentSummary: input.intentSummary,
        metadata: input.metadata ?? {},
        projectId: input.projectId,
        runId: input.runId,
        scope: input.scope,
        ...(input.stepId === undefined ? {} : { stepId: input.stepId }),
      })
      .returning();

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create approval request.",
      );
    }

    revalidateTag(tagApprovalsIndex(input.projectId), "max");
    return toApprovalDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Approve a pending approval request.
 *
 * @param input - Approval decision payload.
 * @returns Updated approval DTO.
 * @throws AppError - With code "not_found" when the approval does not exist.
 */
export async function approveApprovalRequest(
  input: Readonly<{
    approvalId: string;
    approvedBy: string;
  }>,
): Promise<ApprovalDto> {
  const db = getDb();
  const now = new Date();

  try {
    const [row] = await db
      .update(schema.approvalsTable)
      .set({ approvedAt: now, approvedBy: input.approvedBy })
      .where(eq(schema.approvalsTable.id, input.approvalId))
      .returning();

    if (!row) {
      throw new AppError("not_found", 404, "Approval not found.");
    }

    revalidateTag(tagApprovalsIndex(row.projectId), "max");
    return toApprovalDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
