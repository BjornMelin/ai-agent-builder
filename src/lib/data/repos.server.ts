import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagReposIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * JSON-safe repository DTO.
 */
export type RepoDto = Readonly<{
  id: string;
  projectId: string;
  provider: "github";
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
}>;

type RepoRow = typeof schema.reposTable.$inferSelect;

function toRepoDto(row: RepoRow): RepoDto {
  return {
    cloneUrl: row.cloneUrl,
    createdAt: row.createdAt.toISOString(),
    defaultBranch: row.defaultBranch,
    htmlUrl: row.htmlUrl,
    id: row.id,
    name: row.name,
    owner: row.owner,
    projectId: row.projectId,
    provider: row.provider,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * List connected repositories for a project (oldest-first).
 *
 * @param projectId - Project ID.
 * @returns Repo DTOs.
 */
export async function listReposByProject(
  projectId: string,
): Promise<RepoDto[]> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagReposIndex(projectId));

  const db = getDb();
  try {
    const rows = await db.query.reposTable.findMany({
      orderBy: (t) => [asc(t.createdAt)],
      where: eq(schema.reposTable.projectId, projectId),
    });
    return rows.map(toRepoDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Create or update a repo connection for a project.
 *
 * @remarks
 * This is idempotent per `(projectId, provider, owner, name)`.
 *
 * @param input - Repo connection metadata.
 * @returns Upserted repo DTO.
 */
export async function upsertRepoConnection(
  input: Readonly<{
    projectId: string;
    provider: RepoDto["provider"];
    owner: string;
    name: string;
    cloneUrl: string;
    htmlUrl: string;
    defaultBranch: string;
  }>,
): Promise<RepoDto> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await db.query.reposTable.findFirst({
      where: and(
        eq(schema.reposTable.projectId, input.projectId),
        eq(schema.reposTable.provider, input.provider),
        eq(schema.reposTable.owner, input.owner),
        eq(schema.reposTable.name, input.name),
      ),
    });

    if (existing) {
      const [row] = await db
        .update(schema.reposTable)
        .set({
          cloneUrl: input.cloneUrl,
          defaultBranch: input.defaultBranch,
          htmlUrl: input.htmlUrl,
          updatedAt: now,
        })
        .where(eq(schema.reposTable.id, existing.id))
        .returning();

      if (!row) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to update repo connection.",
        );
      }

      revalidateTag(tagReposIndex(input.projectId), "max");
      return toRepoDto(row);
    }

    const [row] = await db
      .insert(schema.reposTable)
      .values({
        cloneUrl: input.cloneUrl,
        defaultBranch: input.defaultBranch,
        htmlUrl: input.htmlUrl,
        name: input.name,
        owner: input.owner,
        projectId: input.projectId,
        provider: input.provider,
      })
      .returning();

    if (!row) {
      throw new AppError("db_insert_failed", 500, "Failed to connect repo.");
    }

    revalidateTag(tagReposIndex(input.projectId), "max");
    return toRepoDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
