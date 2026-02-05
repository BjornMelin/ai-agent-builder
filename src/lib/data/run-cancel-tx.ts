import "server-only";

import { and, eq, notInArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

const NON_CANCELABLE_STATUSES: ("canceled" | "failed" | "succeeded")[] = [
  "canceled",
  "failed",
  "succeeded",
];

/**
 * Cancel a run and mark any non-terminal steps as canceled (transaction helper).
 *
 * @remarks
 * This is safe to call multiple times. It does not overwrite immutable terminal
 * run statuses (`succeeded`, `failed`).
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
    columns: { status: true },
    where: eq(schema.runsTable.id, input.runId),
  });

  if (!existing) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  if (existing.status === "succeeded" || existing.status === "failed") {
    return;
  }

  await tx
    .update(schema.runsTable)
    .set({ status: "canceled", updatedAt: input.now })
    .where(
      and(
        eq(schema.runsTable.id, input.runId),
        notInArray(schema.runsTable.status, NON_CANCELABLE_STATUSES),
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
        notInArray(schema.runStepsTable.status, NON_CANCELABLE_STATUSES),
      ),
    );
}
