import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { tagDeploymentsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { maybeWrapDbNotMigrated } from "@/lib/db/postgres-errors";

/**
 * JSON-safe deployment DTO.
 */
export type DeploymentDto = Readonly<{
  id: string;
  projectId: string;
  runId: string | null;
  provider: "neon" | "upstash" | "vercel";
  status: string;
  vercelProjectId: string | null;
  vercelDeploymentId: string | null;
  deploymentUrl: string | null;
  metadata: Record<string, unknown>;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

type DeploymentRow = typeof schema.deploymentsTable.$inferSelect;

function toDeploymentDto(row: DeploymentRow): DeploymentDto {
  return {
    createdAt: row.createdAt.toISOString(),
    deploymentUrl: row.deploymentUrl ?? null,
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    id: row.id,
    metadata: row.metadata,
    projectId: row.projectId,
    provider: row.provider,
    runId: row.runId ?? null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    vercelDeploymentId: row.vercelDeploymentId ?? null,
    vercelProjectId: row.vercelProjectId ?? null,
  };
}

/**
 * List deployment records for a project (newest-first).
 *
 * @param projectId - Project ID.
 * @param options - Optional filters/pagination.
 * @returns Deployment DTOs ordered newest-first.
 */
export async function listDeploymentsByProject(
  projectId: string,
  options: Readonly<{ runId?: string; limit?: number }> = {},
): Promise<DeploymentDto[]> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagDeploymentsIndex(projectId));

  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);

  try {
    const rows = await db.query.deploymentsTable.findMany({
      limit,
      orderBy: (t) => [desc(t.createdAt), desc(t.id)],
      where:
        options.runId === undefined
          ? eq(schema.deploymentsTable.projectId, projectId)
          : and(
              eq(schema.deploymentsTable.projectId, projectId),
              eq(schema.deploymentsTable.runId, options.runId),
            ),
    });

    return rows.map(toDeploymentDto);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Create a deployment record (non-secret metadata only).
 *
 * @param input - Deployment identity and status.
 * @returns Created deployment DTO.
 */
export async function createDeploymentRecord(
  input: Readonly<{
    projectId: string;
    runId?: string | null;
    provider?: DeploymentDto["provider"];
    status: string;
    vercelProjectId?: string | null;
    vercelDeploymentId?: string | null;
    deploymentUrl?: string | null;
    metadata?: Record<string, unknown>;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }>,
): Promise<DeploymentDto> {
  const db = getDb();
  const now = new Date();

  try {
    const [row] = await db
      .insert(schema.deploymentsTable)
      .values({
        deploymentUrl: input.deploymentUrl ?? null,
        endedAt: input.endedAt ?? null,
        metadata: input.metadata ?? {},
        projectId: input.projectId,
        provider: input.provider ?? "vercel",
        runId: input.runId ?? null,
        startedAt: input.startedAt ?? null,
        status: input.status,
        updatedAt: now,
        vercelDeploymentId: input.vercelDeploymentId ?? null,
        vercelProjectId: input.vercelProjectId ?? null,
      })
      .returning();

    if (!row) {
      throw new AppError(
        "db_insert_failed",
        500,
        "Failed to create deployment record.",
      );
    }

    revalidateTag(tagDeploymentsIndex(input.projectId), "max");
    return toDeploymentDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Update an existing deployment record (non-secret metadata only).
 *
 * @param deploymentId - Deployment record ID.
 * @param input - Patch fields for the record.
 * @returns Updated deployment DTO.
 */
export async function updateDeploymentRecord(
  deploymentId: string,
  input: Readonly<{
    status?: string;
    deploymentUrl?: string | null;
    vercelProjectId?: string | null;
    vercelDeploymentId?: string | null;
    metadata?: Record<string, unknown>;
    startedAt?: Date | null;
    endedAt?: Date | null;
  }>,
): Promise<DeploymentDto> {
  const db = getDb();
  const now = new Date();

  try {
    const [row] = await db
      .update(schema.deploymentsTable)
      .set({
        ...(input.deploymentUrl === undefined
          ? {}
          : { deploymentUrl: input.deploymentUrl }),
        ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(input.startedAt === undefined
          ? {}
          : { startedAt: input.startedAt }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: now,
        ...(input.vercelDeploymentId === undefined
          ? {}
          : { vercelDeploymentId: input.vercelDeploymentId }),
        ...(input.vercelProjectId === undefined
          ? {}
          : { vercelProjectId: input.vercelProjectId }),
      })
      .where(eq(schema.deploymentsTable.id, deploymentId))
      .returning();

    if (!row) {
      throw new AppError("not_found", 404, "Deployment not found.");
    }

    revalidateTag(tagDeploymentsIndex(row.projectId), "max");
    return toDeploymentDto(row);
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find the most recent deployment record by Vercel deployment ID.
 *
 * @param projectId - Project ID.
 * @param vercelDeploymentId - Vercel deployment ID.
 * @returns Deployment DTO or null.
 */
export async function getDeploymentByVercelDeploymentId(
  projectId: string,
  vercelDeploymentId: string,
): Promise<DeploymentDto | null> {
  const db = getDb();

  try {
    const row = await db.query.deploymentsTable.findFirst({
      orderBy: (t) => [desc(t.createdAt), desc(t.id)],
      where: and(
        eq(schema.deploymentsTable.projectId, projectId),
        eq(schema.deploymentsTable.vercelDeploymentId, vercelDeploymentId),
      ),
    });

    return row ? toDeploymentDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Find the most recent deployment record by Vercel deployment ID across all projects.
 *
 * @remarks
 * Webhooks include Vercel deployment IDs but do not carry our internal project IDs,
 * so webhook handlers use this lookup to attach status updates.
 *
 * @param vercelDeploymentId - Vercel deployment ID.
 * @returns Deployment DTO or null.
 */
export async function getDeploymentByVercelDeploymentIdAnyProject(
  vercelDeploymentId: string,
): Promise<DeploymentDto | null> {
  const db = getDb();

  try {
    const row = await db.query.deploymentsTable.findFirst({
      orderBy: (t) => [desc(t.createdAt), desc(t.id)],
      where: eq(schema.deploymentsTable.vercelDeploymentId, vercelDeploymentId),
    });

    return row ? toDeploymentDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}

/**
 * Get a deployment record by ID.
 *
 * @param deploymentId - Deployment ID.
 * @returns Deployment DTO or null.
 */
export async function getDeploymentById(
  deploymentId: string,
): Promise<DeploymentDto | null> {
  const db = getDb();

  try {
    const row = await db.query.deploymentsTable.findFirst({
      where: eq(schema.deploymentsTable.id, deploymentId),
    });

    return row ? toDeploymentDto(row) : null;
  } catch (err) {
    throw maybeWrapDbNotMigrated(err);
  }
}
