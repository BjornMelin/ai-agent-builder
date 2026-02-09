import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagInfraResourcesIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import {
  isUndefinedColumnError,
  isUndefinedTableError,
} from "@/lib/db/postgres-errors";

/**
 * JSON-safe infra resource DTO.
 */
export type InfraResourceDto = Readonly<{
  id: string;
  projectId: string;
  runId: string | null;
  provider: "neon" | "upstash" | "vercel";
  resourceType: string;
  externalId: string;
  region: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}>;

type InfraResourceRow = typeof schema.infraResourcesTable.$inferSelect;

function toInfraResourceDto(row: InfraResourceRow): InfraResourceDto {
  return {
    createdAt: row.createdAt.toISOString(),
    externalId: row.externalId,
    id: row.id,
    metadata: row.metadata,
    projectId: row.projectId,
    provider: row.provider,
    region: row.region ?? null,
    resourceType: row.resourceType,
    runId: row.runId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
 * List infra resource records for a project (newest-first).
 *
 * @param projectId - Project ID.
 * @param options - Optional filters.
 * @returns Infra resource DTOs.
 */
export async function listInfraResourcesByProject(
  projectId: string,
  options: Readonly<{ runId?: string; limit?: number }> = {},
): Promise<InfraResourceDto[]> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagInfraResourcesIndex(projectId));

  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  try {
    const rows = await db.query.infraResourcesTable.findMany({
      limit,
      orderBy: (t) => [desc(t.createdAt), desc(t.id)],
      where:
        options.runId === undefined
          ? eq(schema.infraResourcesTable.projectId, projectId)
          : and(
              eq(schema.infraResourcesTable.projectId, projectId),
              eq(schema.infraResourcesTable.runId, options.runId),
            ),
    });
    return rows.map(toInfraResourceDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Ensure an infra resource record exists (idempotent by external ID).
 *
 * @remarks
 * This never persists secret values. Only non-secret metadata, external IDs,
 * and regions should be recorded.
 *
 * @param input - Infra resource identity.
 * @returns Upserted infra resource DTO.
 */
export async function ensureInfraResourceRecord(
  input: Readonly<{
    projectId: string;
    runId?: string | null;
    provider: InfraResourceDto["provider"];
    resourceType: string;
    externalId: string;
    region?: string | null;
    metadata?: Record<string, unknown>;
  }>,
): Promise<InfraResourceDto> {
  const db = getDb();
  const now = new Date();

  try {
    const existing = await db.query.infraResourcesTable.findFirst({
      orderBy: (t) => [asc(t.createdAt)],
      where: and(
        eq(schema.infraResourcesTable.projectId, input.projectId),
        eq(schema.infraResourcesTable.provider, input.provider),
        eq(schema.infraResourcesTable.resourceType, input.resourceType),
        eq(schema.infraResourcesTable.externalId, input.externalId),
      ),
    });

    if (existing) {
      const nextMetadata = input.metadata
        ? { ...existing.metadata, ...input.metadata }
        : existing.metadata;

      const [row] = await db
        .update(schema.infraResourcesTable)
        .set({
          metadata: nextMetadata,
          ...(input.region === undefined ? {} : { region: input.region }),
          ...(input.runId === undefined ? {} : { runId: input.runId }),
          updatedAt: now,
        })
        .where(eq(schema.infraResourcesTable.id, existing.id))
        .returning();

      if (!row) {
        throw new AppError(
          "db_update_failed",
          500,
          "Failed to update infra resource record.",
        );
      }

      revalidateTag(tagInfraResourcesIndex(input.projectId), "max");
      return toInfraResourceDto(row);
    }

    const [row] = await db
      .insert(schema.infraResourcesTable)
      .values({
        externalId: input.externalId,
        metadata: input.metadata ?? {},
        projectId: input.projectId,
        provider: input.provider,
        region: input.region ?? null,
        resourceType: input.resourceType,
        runId: input.runId ?? null,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create infra resource record.",
      );
    }

    revalidateTag(tagInfraResourcesIndex(input.projectId), "max");
    return toInfraResourceDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
