import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  tagUploadsIndex: vi.fn((projectId: string) => `uploads:${projectId}`),
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
}));

vi.mock("@/lib/cache/tags", () => ({
  tagUploadsIndex: (projectId: string) => state.tagUploadsIndex(projectId),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: state.insertReturning,
        }),
      }),
    }),
    query: {
      projectFilesTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("files DAL", () => {
  it("upsertProjectFile returns a DTO and throws if returning is empty", async () => {
    const now = new Date(0);
    state.insertReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        id: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
        sha256: "h",
        sizeBytes: 3,
        storageKey: "k",
      },
    ]);

    const { upsertProjectFile } = await import("@/lib/data/files.server");
    const dto = await upsertProjectFile({
      mimeType: "text/plain",
      name: "a.txt",
      projectId: "proj_1",
      sha256: "h",
      sizeBytes: 3,
      storageKey: "k",
    });

    expect(dto).toEqual({
      createdAt: now.toISOString(),
      id: "file_1",
      mimeType: "text/plain",
      name: "a.txt",
      projectId: "proj_1",
      sha256: "h",
      sizeBytes: 3,
      storageKey: "k",
    });

    state.insertReturning.mockResolvedValueOnce([]);
    await expect(
      upsertProjectFile({
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
        sha256: "h",
        sizeBytes: 3,
        storageKey: "k",
      }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("getProjectFileById tags the uploads index for the provided projectId and for the row projectId", async () => {
    state.findFirst.mockResolvedValueOnce({
      createdAt: new Date(0),
      id: "file_1",
      mimeType: "text/plain",
      name: "a.txt",
      projectId: "proj_row",
      sha256: "h",
      sizeBytes: 3,
      storageKey: "k",
    });

    const { getProjectFileById } = await import("@/lib/data/files.server");
    const dto = await getProjectFileById("file_1", "proj_param");

    expect(dto?.projectId).toBe("proj_row");
    expect(state.cacheTag).toHaveBeenCalledWith("uploads:proj_param");
    expect(state.cacheTag).toHaveBeenCalledWith("uploads:proj_row");
  });

  it("listProjectFiles clamps limit/offset and returns DTOs", async () => {
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: new Date(0),
        id: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
        sha256: "h",
        sizeBytes: 3,
        storageKey: "k",
      },
    ]);

    const { listProjectFiles } = await import("@/lib/data/files.server");
    const res = await listProjectFiles("proj_1", { limit: 999, offset: -10 });

    expect(res).toHaveLength(1);
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, offset: 0 }),
    );
  });
});
