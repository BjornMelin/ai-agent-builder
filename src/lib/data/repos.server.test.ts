import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
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
    insert: () => ({
      values: () => ({
        returning: state.insertReturning,
      }),
    }),
    query: {
      reposTable: {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("repos DAL", () => {
  it("listReposByProject tags cache and maps DTOs", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        cloneUrl: "https://example.com/repo.git",
        createdAt: now,
        defaultBranch: "main",
        htmlUrl: "https://example.com/repo",
        id: "repo_1",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
        updatedAt: now,
      },
    ]);

    const { listReposByProject } = await import("@/lib/data/repos.server");
    await expect(listReposByProject("proj_1")).resolves.toEqual([
      {
        cloneUrl: "https://example.com/repo.git",
        createdAt: now.toISOString(),
        defaultBranch: "main",
        htmlUrl: "https://example.com/repo",
        id: "repo_1",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
        updatedAt: now.toISOString(),
      },
    ]);

    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("repos:index:proj_1"),
    );
  });

  it("upsertRepoConnection updates existing rows and revalidates", async () => {
    const now = new Date(0);
    const later = new Date(10_000);

    state.findFirst.mockResolvedValueOnce({
      cloneUrl: "https://old/repo.git",
      createdAt: now,
      defaultBranch: "main",
      htmlUrl: "https://old/repo",
      id: "repo_1",
      name: "repo",
      owner: "owner",
      projectId: "proj_1",
      provider: "github",
      updatedAt: now,
    });
    state.updateReturning.mockResolvedValueOnce([
      {
        cloneUrl: "https://new/repo.git",
        createdAt: now,
        defaultBranch: "main",
        htmlUrl: "https://new/repo",
        id: "repo_1",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
        updatedAt: later,
      },
    ]);

    const { upsertRepoConnection } = await import("@/lib/data/repos.server");
    await expect(
      upsertRepoConnection({
        cloneUrl: "https://new/repo.git",
        defaultBranch: "main",
        htmlUrl: "https://new/repo",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
      }),
    ).resolves.toMatchObject({
      cloneUrl: "https://new/repo.git",
      id: "repo_1",
    });

    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining("repos:index:proj_1"),
      "max",
    );
  });

  it("upsertRepoConnection inserts when missing and revalidates", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce(null);
    state.insertReturning.mockResolvedValueOnce([
      {
        cloneUrl: "https://new/repo.git",
        createdAt: now,
        defaultBranch: "main",
        htmlUrl: "https://new/repo",
        id: "repo_1",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
        updatedAt: now,
      },
    ]);

    const { upsertRepoConnection } = await import("@/lib/data/repos.server");
    await expect(
      upsertRepoConnection({
        cloneUrl: "https://new/repo.git",
        defaultBranch: "main",
        htmlUrl: "https://new/repo",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
      }),
    ).resolves.toMatchObject({ id: "repo_1", projectId: "proj_1" });

    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining("repos:index:proj_1"),
      "max",
    );
  });

  it("throws db_update_failed when update returns no rows", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      cloneUrl: "https://old/repo.git",
      createdAt: now,
      defaultBranch: "main",
      htmlUrl: "https://old/repo",
      id: "repo_1",
      name: "repo",
      owner: "owner",
      projectId: "proj_1",
      provider: "github",
      updatedAt: now,
    });
    state.updateReturning.mockResolvedValueOnce([]);

    const { upsertRepoConnection } = await import("@/lib/data/repos.server");
    await expect(
      upsertRepoConnection({
        cloneUrl: "https://new/repo.git",
        defaultBranch: "main",
        htmlUrl: "https://new/repo",
        name: "repo",
        owner: "owner",
        projectId: "proj_1",
        provider: "github",
      }),
    ).rejects.toMatchObject({
      code: "db_update_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = Object.assign(new Error("missing"), { code: "42P01" });
    state.findMany.mockRejectedValueOnce(err);

    const { listReposByProject } = await import("@/lib/data/repos.server");
    await expect(listReposByProject("proj_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
