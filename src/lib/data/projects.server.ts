import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import { isUndefinedTableError } from "@/lib/db/postgres-errors";

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
 * @throws AppError - When inputs are invalid or project creation fails.
 */
export async function createProject(
  input: Readonly<{ name: string; slug: string }>,
): Promise<ProjectDto> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 256) {
    throw new AppError(
      "invalid_input",
      400,
      "Project name must be between 1 and 256 characters.",
    );
  }

  const slug = input.slug.trim().toLowerCase();
  if (
    slug.length === 0 ||
    slug.length > 128 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new AppError(
      "invalid_input",
      400,
      "Project slug must be lowercase alphanumeric with optional dashes.",
    );
  }

  const db = getDb();
  let row: schema.Project | undefined;
  try {
    [row] = await db
      .insert(schema.projectsTable)
      .values({ name, slug })
      .returning();
  } catch (err) {
    if (isUndefinedTableError(err)) {
      throw new AppError(
        "db_not_migrated",
        500,
        "Database is not migrated. Run migrations and try again.",
        err,
      );
    }
    throw err;
  }

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
 * List projects ordered by newest first.
 *
 * @param options - Pagination options.
 * @returns Project DTOs.
 */
const listProjectsCached = cache(
  async (limit: number, offset: number): Promise<ProjectDto[]> => {
    const db = getDb();
    try {
      const rows = await db.query.projectsTable.findMany({
        limit,
        offset,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return rows.map(toProjectDto);
    } catch (err) {
      if (isUndefinedTableError(err)) {
        throw new AppError(
          "db_not_migrated",
          500,
          "Database is not migrated. Run migrations and refresh the page.",
          err,
        );
      }
      throw err;
    }
  },
);

/**
 * List projects with pagination guardrails.
 *
 * @param options - Pagination options (limit/offset).
 * @returns Project DTOs ordered by newest first.
 */
export async function listProjects(
  options: Readonly<{ limit?: number; offset?: number }> = {},
): Promise<ProjectDto[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return listProjectsCached(limit, offset);
}
