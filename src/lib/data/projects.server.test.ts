import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  artifactsFindMany: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  chatFindFirst: vi.fn(),
  deleteReturning: vi.fn(),
  deploymentFindFirst: vi.fn(),
  execute: vi.fn(),
  filesFindMany: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  infraFindFirst: vi.fn(),
  insertReturning: vi.fn(),
  projectSkillsFindMany: vi.fn(),
  reposFindMany: vi.fn(),
  runFindFirst: vi.fn(),
  sandboxFindMany: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
}));

vi.mock("@/db/client", () => ({
  getDb: () => {
    const query = {
      artifactsTable: { findMany: state.artifactsFindMany },
      chatThreadsTable: { findFirst: state.chatFindFirst },
      deploymentsTable: { findFirst: state.deploymentFindFirst },
      infraResourcesTable: { findFirst: state.infraFindFirst },
      projectFilesTable: { findMany: state.filesFindMany },
      projectSkillsTable: { findMany: state.projectSkillsFindMany },
      projectsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
      reposTable: { findMany: state.reposFindMany },
      runsTable: { findFirst: state.runFindFirst },
      sandboxJobsTable: { findMany: state.sandboxFindMany },
    };
    const db = {
      delete: () => ({
        where: () => ({ returning: state.deleteReturning }),
      }),
      insert: () => ({
        values: () => ({
          returning: state.insertReturning,
        }),
      }),
      query,
      update: () => ({
        set: () => ({
          where: () => ({ returning: state.updateReturning }),
        }),
      }),
    };
    return {
      ...db,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        await callback({ ...db, execute: state.execute }),
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.findFirst.mockResolvedValue(undefined);
  state.updateReturning.mockResolvedValue([]);
  state.artifactsFindMany.mockResolvedValue([]);
  state.chatFindFirst.mockResolvedValue(undefined);
  state.deploymentFindFirst.mockResolvedValue(undefined);
  state.execute.mockResolvedValue(undefined);
  state.filesFindMany.mockResolvedValue([]);
  state.infraFindFirst.mockResolvedValue(undefined);
  state.projectSkillsFindMany.mockResolvedValue([]);
  state.reposFindMany.mockResolvedValue([]);
  state.runFindFirst.mockResolvedValue(undefined);
  state.sandboxFindMany.mockResolvedValue([]);
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
    const err = Object.assign(new Error("missing"), { code: "42P01" });
    state.insertReturning.mockRejectedValueOnce(err);

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
    state.findFirst.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42703" }),
    );

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
    state.findMany.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "42P01" }),
    );

    const { listProjects } = await import("@/lib/data/projects.server");
    await expect(listProjects("user_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("updates project metadata and lifecycle state for an exact owner", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValue({
      createdAt: now,
      id: "proj_1",
      name: "Renamed",
      ownerUserId: "user_1",
      slug: "renamed",
      status: "active",
      updatedAt: now,
    });
    state.updateReturning
      .mockResolvedValueOnce([
        {
          createdAt: now,
          id: "proj_1",
          name: "Renamed",
          ownerUserId: "user_1",
          slug: "renamed",
          status: "active",
          updatedAt: now,
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: now,
          id: "proj_1",
          name: "Renamed",
          ownerUserId: "user_1",
          slug: "renamed",
          status: "archived",
          updatedAt: now,
        },
      ]);

    const { setProjectStatusForUser, updateProjectForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      updateProjectForUser({
        name: " Renamed ",
        projectId: "proj_1",
        slug: "Renamed",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({ name: "Renamed", slug: "renamed" });
    await expect(
      setProjectStatusForUser({
        projectId: "proj_1",
        status: "archived",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({ status: "archived" });
    expect(state.execute).toHaveBeenCalledTimes(2);
  });

  it("serializes archive with producers and blocks active work", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValue({
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "active",
      updatedAt: now,
    });
    state.runFindFirst.mockResolvedValueOnce({ id: "run_1" });

    const { setProjectStatusForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      setProjectStatusForUser({
        projectId: "proj_1",
        status: "archived",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "project_has_active_work", status: 409 });
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.updateReturning).not.toHaveBeenCalled();
  });

  it("does not mutate a missing or non-exactly-owned project", async () => {
    state.updateReturning.mockResolvedValue([]);
    const { setProjectStatusForUser, updateProjectForUser } = await import(
      "@/lib/data/projects.server"
    );

    await expect(
      updateProjectForUser({
        name: "Project",
        projectId: "proj_1",
        slug: "project",
        userId: "user_2",
      }),
    ).rejects.toMatchObject({ code: "project_not_found", status: 404 });
    state.findFirst.mockResolvedValueOnce(undefined);
    await expect(
      setProjectStatusForUser({
        projectId: "proj_1",
        status: "archived",
        userId: "user_2",
      }),
    ).rejects.toMatchObject({ code: "project_not_found", status: 404 });
  });

  it("atomically claims an archived idle project for deletion", async () => {
    const now = new Date(0);
    const archived = {
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "archived",
      updatedAt: now,
    };
    state.findFirst.mockResolvedValue(archived);
    state.updateReturning.mockResolvedValueOnce([
      { ...archived, status: "deleting" },
    ]);

    const { claimProjectDeletionForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      claimProjectDeletionForUser({
        confirmation: "project",
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).resolves.toMatchObject({ status: "deleting" });
    expect(state.execute).toHaveBeenCalledOnce();
  });

  it("blocks a deletion claim while active work remains", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValue({
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "archived",
      updatedAt: now,
    });
    const { claimProjectDeletionForUser } = await import(
      "@/lib/data/projects.server"
    );
    const input = {
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    } as const;

    state.runFindFirst.mockResolvedValueOnce({ id: "run_1" });
    await expect(claimProjectDeletionForUser(input)).rejects.toMatchObject({
      code: "project_has_active_work",
      status: 409,
    });

    expect(state.updateReturning).not.toHaveBeenCalled();
  });

  it("builds a deduplicated deletion plan for a claimed project", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValue({
      createdAt: now,
      id: "proj_1",
      name: "Project",
      ownerUserId: "user_1",
      slug: "project",
      status: "deleting",
      updatedAt: now,
    });
    state.filesFindMany.mockResolvedValue([
      { storageKey: "blob/a" },
      { storageKey: "blob/a" },
      { storageKey: "blob/b" },
    ]);
    state.projectSkillsFindMany.mockResolvedValue([
      {
        metadata: {
          bundle: {
            blobPath: "blob/skill-bundle",
            fileCount: 2,
            format: "zip-v1",
            sizeBytes: 128,
          },
        },
      },
    ]);
    state.artifactsFindMany.mockResolvedValue([
      { content: { blobPath: "blob/audit-bundle" } },
      { content: { blobPath: 42 } },
    ]);
    state.sandboxFindMany.mockResolvedValue([
      {
        sandboxId: "sandbox_1",
        sandboxStoppedAt: now,
        status: "succeeded",
        transcriptBlobRef: "blob/transcript",
      },
    ]);

    const { prepareProjectDeletionForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      prepareProjectDeletionForUser({
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).resolves.toEqual({
      blobRefs: [
        "blob/a",
        "blob/b",
        "blob/transcript",
        "blob/skill-bundle",
        "blob/audit-bundle",
      ],
      project: {
        createdAt: now.toISOString(),
        id: "proj_1",
        name: "Project",
        slug: "project",
        status: "deleting",
        updatedAt: now.toISOString(),
      },
    });
  });

  it("refuses cleanup until deletion has been claimed", async () => {
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

    const { prepareProjectDeletionForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      prepareProjectDeletionForUser({
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "project_not_claimed", status: 409 });
  });

  it("hard-deletes the archived row and reports concurrent changes", async () => {
    state.deleteReturning.mockResolvedValueOnce([{ id: "proj_1" }]);
    const { hardDeleteProjectForUser } = await import(
      "@/lib/data/projects.server"
    );
    await expect(
      hardDeleteProjectForUser({
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).resolves.toBeUndefined();

    state.deleteReturning.mockResolvedValueOnce([]);
    await expect(
      hardDeleteProjectForUser({
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({
      code: "project_delete_conflict",
      status: 409,
    });
  });
});
