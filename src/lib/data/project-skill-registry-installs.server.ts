import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/db/postgres-errors";

type InstallRow = typeof schema.projectSkillRegistryInstallsTable.$inferSelect;

function maybeWrapDbNotMigrated(err: unknown): unknown {
  if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
    return new AppError(
      "db_not_migrated",
      500,
      "Database is not migrated. Run migrations and refresh the page.",
      err,
    );
  }
  return err;
}

/**
 * Persist a binding between a skills registry install workflow run and a project.
 *
 * @param input - Project + workflow run identifiers.
 * @returns Stored mapping row.
 */
export async function recordProjectSkillRegistryInstall(
  input: Readonly<{
    projectId: string;
    workflowRunId: string;
    registryId: string;
  }>,
): Promise<InstallRow> {
  const db = getDb();
  const now = new Date();
  try {
    const [row] = await db
      .insert(schema.projectSkillRegistryInstallsTable)
      .values({
        projectId: input.projectId,
        registryId: input.registryId,
        updatedAt: now,
        workflowRunId: input.workflowRunId,
      })
      .onConflictDoNothing({
        target: schema.projectSkillRegistryInstallsTable.workflowRunId,
      })
      .returning();

    if (row) return row;

    // If we hit a conflict, fetch the existing row.
    const existing = await db.query.projectSkillRegistryInstallsTable.findFirst(
      {
        where: eq(
          schema.projectSkillRegistryInstallsTable.workflowRunId,
          input.workflowRunId,
        ),
      },
    );
    if (!existing) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create registry install mapping.",
      );
    }

    return existing;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Assert that a skills registry install workflow run belongs to the project.
 *
 * @param input - Project + workflow run identifiers.
 * @returns Ok when the mapping exists.
 * @throws AppError - With code `"not_found"` when the mapping is missing.
 */
export async function assertProjectOwnsRegistryInstallRun(
  input: Readonly<{ projectId: string; workflowRunId: string }>,
): Promise<void> {
  const db = getDb();
  try {
    const row = await db.query.projectSkillRegistryInstallsTable.findFirst({
      where: and(
        eq(schema.projectSkillRegistryInstallsTable.projectId, input.projectId),
        eq(
          schema.projectSkillRegistryInstallsTable.workflowRunId,
          input.workflowRunId,
        ),
      ),
    });

    if (!row) {
      throw new AppError("not_found", 404, "Run not found.");
    }
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
