import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { type DbClient, getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * Run one resource-producing commit while holding the project's lifecycle lock.
 *
 * Deletion claims use the same transaction-scoped advisory lock. The project
 * must still be active after the lock is acquired, so a producer either commits
 * before deletion observes it or is rejected after deletion owns the fence.
 *
 * @param input - Project scope and optional exact authenticated owner.
 * @param work - Resource-producing commit to run while the lease is held.
 * @returns The producer result.
 */
export async function withActiveProjectLease<T>(
  input: Readonly<{ projectId: string; userId?: string }>,
  work: (db: DbClient) => Promise<T>,
): Promise<T> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const ownership = input.userId
        ? and(
            eq(schema.projectsTable.id, input.projectId),
            eq(schema.projectsTable.ownerUserId, input.userId),
          )
        : eq(schema.projectsTable.id, input.projectId);
      const project = await tx.query.projectsTable.findFirst({
        columns: { ownerUserId: true, status: true },
        where: ownership,
      });
      if (!project) {
        throw new AppError("project_not_found", 404, "Project not found.");
      }
      if (project.status !== "active") {
        throw new AppError(
          "project_not_active",
          409,
          "Restore the project before starting new work.",
        );
      }
      // A transaction exposes the same query-builder surface used by these
      // producers. Passing it through prevents callbacks from requesting a
      // second connection while the lifecycle lock owns the pool connection.
      return await work(tx as unknown as DbClient);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}
