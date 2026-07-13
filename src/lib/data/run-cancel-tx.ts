import "server-only";

import { and, eq, isNotNull, notInArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

const NON_CANCELABLE_STATUSES = ["canceled", "failed", "succeeded"] as const;

/**
 * Cancel a run and mark any non-terminal steps as canceled (transaction helper).
 *
 * @remarks
 * This is safe to call multiple times. A non-terminal run must already carry
 * the durable cancellation fence; terminal runs remain immutable.
 *
 * @param tx - Drizzle transaction handle.
 * @param input - Cancel payload.
 * @returns Void.
 * @throws AppError - With code "not_found" (404) when the run cannot be found.
 */
export async function cancelRunAndStepsTx(
  tx: DbClient,
  input: Readonly<{ runId: string; now: Date }>,
): Promise<void> {
  const existing = await tx.query.runsTable.findFirst({
    columns: { cancelRequestedAt: true, status: true },
    where: eq(schema.runsTable.id, input.runId),
  });

  if (!existing) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  if (
    existing.status === "succeeded" ||
    existing.status === "failed" ||
    existing.status === "canceled"
  ) {
    return;
  }

  if (!existing.cancelRequestedAt) {
    throw new AppError(
      "run_cancellation_not_requested",
      409,
      "Run cancellation was not requested.",
    );
  }

  await tx
    .update(schema.runsTable)
    .set({ status: "canceled", updatedAt: input.now })
    .where(
      and(
        eq(schema.runsTable.id, input.runId),
        isNotNull(schema.runsTable.cancelRequestedAt),
        notInArray(schema.runsTable.status, [...NON_CANCELABLE_STATUSES]),
      ),
    );

  await tx
    .update(schema.runStepsTable)
    .set({
      endedAt: input.now,
      status: "canceled",
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.runStepsTable.runId, input.runId),
        notInArray(schema.runStepsTable.status, [...NON_CANCELABLE_STATUSES]),
      ),
    );
}
