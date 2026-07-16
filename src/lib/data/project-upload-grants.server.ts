import "server-only";

import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";
import { withActiveProjectLease } from "@/lib/projects/project-lifecycle-lease.server";

/** Five-minute capability window for direct-to-Blob client uploads. */
export const PROJECT_UPLOAD_GRANT_TTL_MS = 5 * 60 * 1000;

export type ProjectUploadCompletionDisposition = "delete" | "keep";

/**
 * Persist a client-upload capability while holding the project's active lease.
 *
 * The grant is committed before the bearer token is returned. A deletion claim
 * therefore either precedes token issuance or observes the durable grant and
 * keeps the project in its retryable `deleting` state until the token settles.
 *
 * @param input - Exact owner, project, pathname, and token expiry.
 * @returns The durable grant identity embedded in the signed token payload.
 */
export async function issueProjectUploadGrant(
  input: Readonly<{
    expiresAt: Date;
    pathname: string;
    projectId: string;
    userId: string;
  }>,
): Promise<Readonly<{ id: string }>> {
  return await withActiveProjectLease(
    { projectId: input.projectId, userId: input.userId },
    async (db) => {
      const [grant] = await db
        .insert(schema.projectUploadGrantsTable)
        .values({
          expiresAt: input.expiresAt,
          pathname: input.pathname,
          projectId: input.projectId,
        })
        .returning({ id: schema.projectUploadGrantsTable.id });
      if (!grant) {
        throw new AppError(
          "upload_grant_failed",
          500,
          "Failed to authorize the upload.",
        );
      }
      return grant;
    },
  );
}

/**
 * Resolve a signed upload-completion callback under the lifecycle lock.
 *
 * Active-project completions are marked settled and kept. Missing or inactive
 * projects require provider cleanup; their grant remains pending until the
 * caller confirms that Blob deletion succeeded.
 *
 * @param input - Signed grant and project identity.
 * @returns Whether the uploaded Blob should be kept or deleted.
 */
export async function resolveProjectUploadCompletion(
  input: Readonly<{ grantId: string; projectId: string }>,
): Promise<ProjectUploadCompletionDisposition> {
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`,
      );
      const project = await tx.query.projectsTable.findFirst({
        columns: { status: true },
        where: eq(schema.projectsTable.id, input.projectId),
      });
      if (!project || project.status !== "active") return "delete";

      const grant = await tx.query.projectUploadGrantsTable.findFirst({
        columns: { id: true },
        where: and(
          eq(schema.projectUploadGrantsTable.id, input.grantId),
          eq(schema.projectUploadGrantsTable.projectId, input.projectId),
        ),
      });
      if (!grant) {
        throw new AppError(
          "upload_grant_not_found",
          409,
          "Upload authorization is no longer valid.",
        );
      }

      await tx
        .update(schema.projectUploadGrantsTable)
        .set({ completedAt: new Date() })
        .where(eq(schema.projectUploadGrantsTable.id, grant.id));
      return "keep";
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Remove a rejected upload grant only after its Blob has been deleted.
 *
 * @param input - Signed grant and project identity.
 */
export async function removeRejectedProjectUploadGrant(
  input: Readonly<{ grantId: string; projectId: string }>,
): Promise<void> {
  const db = getDb();
  try {
    await db
      .delete(schema.projectUploadGrantsTable)
      .where(
        and(
          eq(schema.projectUploadGrantsTable.id, input.grantId),
          eq(schema.projectUploadGrantsTable.projectId, input.projectId),
        ),
      );
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Refuse final provider cleanup while any client-upload token can still write.
 *
 * Completed and expired grants are removed under the lifecycle lock. Once no
 * live capability remains, deletion performs a fresh Blob prefix sweep before
 * removing the project row.
 *
 * @param projectId - Deletion-pending project identity.
 */
export async function assertProjectUploadGrantsSettled(
  projectId: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${projectId}, 0))`,
      );
      await tx
        .delete(schema.projectUploadGrantsTable)
        .where(
          and(
            eq(schema.projectUploadGrantsTable.projectId, projectId),
            or(
              isNotNull(schema.projectUploadGrantsTable.completedAt),
              lte(schema.projectUploadGrantsTable.expiresAt, now),
            ),
          ),
        );
      const pending = await tx.query.projectUploadGrantsTable.findFirst({
        columns: { expiresAt: true },
        orderBy: (grant, { asc }) => [asc(grant.expiresAt)],
        where: eq(schema.projectUploadGrantsTable.projectId, projectId),
      });
      if (pending) {
        throw new AppError(
          "project_uploads_pending",
          409,
          `A client upload is still authorized. Retry deletion after ${pending.expiresAt.toISOString()}.`,
        );
      }
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw maybeWrapDbNotMigrated(err);
  }
}
