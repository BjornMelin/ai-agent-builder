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
      infraResourcesTable: {
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
});

describe("infra resources DAL", () => {
  it("listInfraResourcesByProject clamps limit and tags cache", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: now,
        externalId: "ext_1",
        id: "ir_1",
        metadata: {},
        projectId: "proj_1",
        provider: "vercel",
        region: null,
        resourceType: "vercel.project",
        runId: "run_1",
        updatedAt: now,
      },
    ]);

    const { listInfraResourcesByProject } = await import(
      "@/lib/data/infra-resources.server"
    );
    await expect(
      listInfraResourcesByProject("proj_1", { limit: 9999 }),
    ).resolves.toMatchObject([{ id: "ir_1", projectId: "proj_1" }]);

    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("infra-resources:index:proj_1"),
    );
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("ensureInfraResourceRecord updates existing records and merges metadata", async () => {
    const now = new Date(0);
    const later = new Date(10_000);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      externalId: "ext_1",
      id: "ir_1",
      metadata: { a: 1 },
      projectId: "proj_1",
      provider: "vercel",
      region: null,
      resourceType: "vercel.project",
      runId: null,
      updatedAt: now,
    });
    state.updateReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        externalId: "ext_1",
        id: "ir_1",
        metadata: { a: 1, b: 2 },
        projectId: "proj_1",
        provider: "vercel",
        region: "iad1",
        resourceType: "vercel.project",
        runId: "run_1",
        updatedAt: later,
      },
    ]);

    const { ensureInfraResourceRecord } = await import(
      "@/lib/data/infra-resources.server"
    );
    await expect(
      ensureInfraResourceRecord({
        externalId: "ext_1",
        metadata: { b: 2 },
        projectId: "proj_1",
        provider: "vercel",
        region: "iad1",
        resourceType: "vercel.project",
        runId: "run_1",
      }),
    ).resolves.toMatchObject({
      id: "ir_1",
      metadata: { a: 1, b: 2 },
      region: "iad1",
      runId: "run_1",
    });
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = new Error("missing");
    state.findMany.mockRejectedValueOnce(err);
    state.isUndefinedTableError.mockReturnValueOnce(true);

    const { listInfraResourcesByProject } = await import(
      "@/lib/data/infra-resources.server"
    );
    await expect(listInfraResourcesByProject("proj_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
