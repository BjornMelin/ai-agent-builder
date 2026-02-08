import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  isUndefinedColumnError: vi.fn(),
  isUndefinedTableError: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        returning: state.insertReturning,
      }),
    }),
    query: {
      projectsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
    },
  }),
}));

vi.mock("@/lib/db/postgres-errors", () => ({
  isUndefinedColumnError: (err: unknown) => state.isUndefinedColumnError(err),
  isUndefinedTableError: (err: unknown) => state.isUndefinedTableError(err),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.isUndefinedColumnError.mockReturnValue(false);
  state.isUndefinedTableError.mockReturnValue(false);
});

describe("projects DAL", () => {
  it("validates name, owner, and slug inputs", async () => {
    const { createProject } = await import("@/lib/data/projects.server");

    await expect(
      createProject({ name: " ", ownerUserId: "u", slug: "ok" }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      status: 400,
    } satisfies Partial<AppError>);

    await expect(
      createProject({ name: "x", ownerUserId: " ", slug: "ok" }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      status: 400,
    } satisfies Partial<AppError>);

    await expect(
      createProject({ name: "x", ownerUserId: "u", slug: "Bad Slug" }),
    ).rejects.toMatchObject({
      code: "invalid_input",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("creates a project and maps it to a DTO", async () => {
    const now = new Date(0);
    state.insertReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        id: "proj_1",
        name: "Project",
        ownerUserId: "user_1",
        slug: "project",
        status: "active",
        updatedAt: now,
      },
    ]);

    const { createProject } = await import("@/lib/data/projects.server");
    const dto = await createProject({
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
    });

    expect(dto).toEqual({
      createdAt: now.toISOString(),
      id: "proj_1",
      name: "Project",
      slug: "project",
      status: "active",
      updatedAt: now.toISOString(),
    });
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = new Error("missing");
    state.insertReturning.mockRejectedValueOnce(err);
    state.isUndefinedTableError.mockReturnValueOnce(true);

    const { createProject } = await import("@/lib/data/projects.server");
    await expect(
      createProject({
        name: "Project",
        ownerUserId: "user_1",
        slug: "project",
      }),
    ).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("wraps undefined-table/column errors in reads too", async () => {
    state.findFirst.mockRejectedValueOnce(new Error("missing"));
    state.isUndefinedColumnError.mockReturnValueOnce(true);

    const { getProjectByIdForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      getProjectByIdForUser("proj_1", "user_1"),
    ).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("throws db_insert_failed when the insert returns no rows", async () => {
    state.insertReturning.mockResolvedValueOnce([]);

    const { createProject } = await import("@/lib/data/projects.server");
    await expect(
      createProject({
        name: "Project",
        ownerUserId: "user_1",
        slug: "project",
      }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("returns a project DTO by id when found, and null when missing", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "active",
      updatedAt: now,
    });

    const { getProjectByIdForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(getProjectByIdForUser("proj_1", "user_1")).resolves.toEqual({
      createdAt: now.toISOString(),
      id: "proj_1",
      name: "Project",
      slug: "project",
      status: "active",
      updatedAt: now.toISOString(),
    });

    state.findFirst.mockResolvedValueOnce(null);
    await expect(
      getProjectByIdForUser("proj_missing", "user_1"),
    ).resolves.toBeNull();
  });

  it("tags the project id when fetching by slug returns a row", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "active",
      updatedAt: now,
    });

    const { getProjectBySlugForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      getProjectBySlugForUser("project", "user_1"),
    ).resolves.toMatchObject({
      id: "proj_1",
    });

    // Called for tagProjectsIndex(userId) and then tagProject(projectId).
    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("projects"),
    );
    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("project:proj_1"),
    );

    vi.resetModules();
    vi.clearAllMocks();
    state.findFirst.mockResolvedValueOnce(null);
    const { getProjectBySlugForUser: getNull } = await import(
      "@/lib/data/projects.server"
    );
    await expect(getNull("missing", "user_1")).resolves.toBeNull();
    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("projects"),
    );
    expect(state.cacheTag).not.toHaveBeenCalledWith(
      expect.stringContaining("project:"),
    );
  });

  it("lists projects with clamped limit/offset and maps DTOs", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: now,
        id: "proj_1",
        name: "Project",
        ownerUserId: "user_1",
        slug: "project",
        status: "active",
        updatedAt: now,
      },
    ]);

    const { listProjects } = await import("@/lib/data/projects.server");
    const rows = await listProjects("user_1", { limit: 0, offset: -10 });

    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1, offset: 0 }),
    );
    expect(rows).toEqual([
      {
        createdAt: now.toISOString(),
        id: "proj_1",
        name: "Project",
        slug: "project",
        status: "active",
        updatedAt: now.toISOString(),
      },
    ]);

    state.findMany.mockResolvedValueOnce([]);
    await listProjects("user_1", { limit: 999, offset: 5 });
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, offset: 5 }),
    );
  });

  it("wraps undefined-table/column errors in listProjects", async () => {
    state.findMany.mockRejectedValueOnce(new Error("missing"));
    state.isUndefinedTableError.mockReturnValueOnce(true);

    const { listProjects } = await import("@/lib/data/projects.server");
    await expect(listProjects("user_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
