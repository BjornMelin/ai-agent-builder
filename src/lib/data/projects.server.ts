import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";

/**
 * JSON-safe project DTO.
 *
 * Prefer returning DTOs (not Drizzle rows) from the DAL to avoid leaking
 * server-only fields and to keep values serializable across RSC boundaries.
 */
export type ProjectDto = Readonly<{
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}>;

function toProjectDto(row: schema.Project): ProjectDto {
  return {
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create a new project.
 *
 * @param input - Project creation inputs.
 * @returns Created project DTO.
 */
export async function createProject(
  input: Readonly<{ name: string; slug: string }>,
): Promise<ProjectDto> {
  const db = getDb();
  const [row] = await db
    .insert(schema.projectsTable)
    .values({ name: input.name, slug: input.slug })
    .returning();

  if (!row) {
    throw new AppError("db_insert_failed", 500, "Failed to create project.");
  }

  return toProjectDto(row);
}

/**
 * Get a project by ID (cached per request).
 *
 * @param id - Project ID.
 * @returns Project DTO or null.
 */
export const getProjectById = cache(
  async (id: string): Promise<ProjectDto | null> => {
    const db = getDb();
    const row = await db.query.projectsTable.findFirst({
      where: eq(schema.projectsTable.id, id),
    });

    return row ? toProjectDto(row) : null;
  },
);

/**
 * Get a project by slug (cached per request).
 *
 * @param slug - Project slug.
 * @returns Project DTO or null.
 */
export const getProjectBySlug = cache(
  async (slug: string): Promise<ProjectDto | null> => {
    const db = getDb();
    const row = await db.query.projectsTable.findFirst({
      where: eq(schema.projectsTable.slug, slug),
    });

    return row ? toProjectDto(row) : null;
  },
);

/**
 * List all projects ordered by newest first.
 *
 * @returns Project DTOs.
 */
export async function listProjects(): Promise<ProjectDto[]> {
  const db = getDb();
  const rows = await db.query.projectsTable.findMany({
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return rows.map(toProjectDto);
}
