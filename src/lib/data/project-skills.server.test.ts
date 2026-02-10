import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  deleteWhere: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  isUndefinedColumnError: vi.fn(),
  isUndefinedTableError: vi.fn(),
  revalidateTag: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: (...args: unknown[]) => state.cacheLife(...args),
  cacheTag: (...args: unknown[]) => state.cacheTag(...args),
  revalidateTag: (...args: unknown[]) => state.revalidateTag(...args),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    delete: () => ({
      where: state.deleteWhere,
    }),
    insert: () => ({
      values: () => ({
        returning: state.insertReturning,
      }),
    }),
    query: {
      projectSkillsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: state.updateReturning,
        }),
      }),
    }),
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
  state.deleteWhere.mockResolvedValue(undefined);
});

describe("project skills DAL", () => {
  it("listProjectSkillsByProject tags cache and maps DTOs", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        content: "---\nname: a\ndescription: b\n---\n\n# x\n",
        createdAt: now,
        description: "b",
        id: "skill_1",
        metadata: {},
        name: "a",
        nameNorm: "a",
        projectId: "proj_1",
        updatedAt: now,
      },
    ]);

    const { listProjectSkillsByProject } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(listProjectSkillsByProject("proj_1")).resolves.toEqual([
      {
        content: "---\nname: a\ndescription: b\n---\n\n# x\n",
        createdAt: now.toISOString(),
        description: "b",
        id: "skill_1",
        metadata: {},
        name: "a",
        projectId: "proj_1",
        updatedAt: now.toISOString(),
      },
    ]);

    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("skills:index:proj_1"),
    );
  });

  it("getProjectSkillByName normalizes and returns a DTO", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      content: "---\nname: a\ndescription: b\n---\n",
      createdAt: now,
      description: "b",
      id: "skill_1",
      metadata: { hello: "world" },
      name: "A",
      nameNorm: "a",
      projectId: "proj_1",
      updatedAt: now,
    });

    const { getProjectSkillByName } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(
      getProjectSkillByName("proj_1", "  A  "),
    ).resolves.toMatchObject({
      id: "skill_1",
      name: "A",
      projectId: "proj_1",
    });
  });

  it("getProjectSkillById returns null when missing", async () => {
    state.findFirst.mockResolvedValueOnce(null);
    const { getProjectSkillById } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(getProjectSkillById("proj_1", "missing")).resolves.toBeNull();
  });

  it("upsertProjectSkill updates existing rows and revalidates", async () => {
    const now = new Date(0);
    const later = new Date(10_000);

    state.findFirst.mockResolvedValueOnce({
      content: "---\nname: a\ndescription: b\n---\n",
      createdAt: now,
      description: "b",
      id: "skill_1",
      metadata: { prev: true },
      name: "a",
      nameNorm: "a",
      projectId: "proj_1",
      updatedAt: now,
    });

    state.updateReturning.mockResolvedValueOnce([
      {
        content: "---\nname: a\ndescription: b\n---\nupdated\n",
        createdAt: now,
        description: "b2",
        id: "skill_1",
        metadata: { next: true },
        name: "a",
        nameNorm: "a",
        projectId: "proj_1",
        updatedAt: later,
      },
    ]);

    const { upsertProjectSkill } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(
      upsertProjectSkill({
        content: "---\nname: a\ndescription: b\n---\nupdated\n",
        description: "b2",
        metadata: { next: true },
        name: "a",
        projectId: "proj_1",
      }),
    ).resolves.toMatchObject({ description: "b2", id: "skill_1" });

    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining("skills:index:proj_1"),
      "max",
    );
  });

  it("upsertProjectSkill inserts when missing and revalidates", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce(null);
    state.insertReturning.mockResolvedValueOnce([
      {
        content: "---\nname: a\ndescription: b\n---\n",
        createdAt: now,
        description: "b",
        id: "skill_1",
        metadata: {},
        name: "a",
        nameNorm: "a",
        projectId: "proj_1",
        updatedAt: now,
      },
    ]);

    const { upsertProjectSkill } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(
      upsertProjectSkill({
        content: "---\nname: a\ndescription: b\n---\n",
        description: "b",
        name: "a",
        projectId: "proj_1",
      }),
    ).resolves.toMatchObject({ id: "skill_1", projectId: "proj_1" });

    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining("skills:index:proj_1"),
      "max",
    );
  });

  it("deleteProjectSkill throws not_found when missing", async () => {
    state.findFirst.mockResolvedValueOnce(null);
    const { deleteProjectSkill } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(
      deleteProjectSkill({ projectId: "proj_1", skillId: "missing" }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("deleteProjectSkill deletes and revalidates", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      content: "---\nname: a\ndescription: b\n---\n",
      createdAt: now,
      description: "b",
      id: "skill_1",
      metadata: {},
      name: "a",
      nameNorm: "a",
      projectId: "proj_1",
      updatedAt: now,
    });

    const { deleteProjectSkill } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(
      deleteProjectSkill({ projectId: "proj_1", skillId: "skill_1" }),
    ).resolves.toEqual({ ok: true });

    expect(state.deleteWhere).toHaveBeenCalled();
    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining("skills:index:proj_1"),
      "max",
    );
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = new Error("missing");
    state.findMany.mockRejectedValueOnce(err);
    state.isUndefinedTableError.mockReturnValueOnce(true);

    const { listProjectSkillsByProject } = await import(
      "@/lib/data/project-skills.server"
    );
    await expect(listProjectSkillsByProject("proj_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
