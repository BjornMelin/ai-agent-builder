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
      deploymentsTable: {
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

describe("deployments DAL", () => {
  it("listDeploymentsByProject clamps limit and tags cache", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: now,
        deploymentUrl: null,
        endedAt: null,
        id: "dep_1",
        metadata: {},
        projectId: "proj_1",
        provider: "vercel",
        runId: "run_1",
        startedAt: now,
        status: "running",
        updatedAt: now,
        vercelDeploymentId: null,
        vercelProjectId: null,
      },
    ]);

    const { listDeploymentsByProject } = await import(
      "@/lib/data/deployments.server"
    );

    await expect(
      listDeploymentsByProject("proj_1", { limit: 9999 }),
    ).resolves.toMatchObject([{ id: "dep_1", projectId: "proj_1" }]);

    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("deployments:index:proj_1"),
    );
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("createDeploymentRecord throws db_insert_failed when returning is empty", async () => {
    state.insertReturning.mockResolvedValueOnce([]);
    const { createDeploymentRecord } = await import(
      "@/lib/data/deployments.server"
    );

    await expect(
      createDeploymentRecord({ projectId: "proj_1", status: "running" }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("updateDeploymentRecord throws not_found when returning is empty", async () => {
    state.updateReturning.mockResolvedValueOnce([]);
    const { updateDeploymentRecord } = await import(
      "@/lib/data/deployments.server"
    );

    await expect(
      updateDeploymentRecord("dep_missing", { status: "done" }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("getDeploymentByVercelDeploymentId and AnyProject return DTOs or null", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      deploymentUrl: "https://example.com",
      endedAt: null,
      id: "dep_1",
      metadata: {},
      projectId: "proj_1",
      provider: "vercel",
      runId: "run_1",
      startedAt: now,
      status: "running",
      updatedAt: now,
      vercelDeploymentId: "vdep_1",
      vercelProjectId: "vproj_1",
    });

    const mod = await import("@/lib/data/deployments.server");
    await expect(
      mod.getDeploymentByVercelDeploymentId("proj_1", "vdep_1"),
    ).resolves.toMatchObject({ id: "dep_1", vercelDeploymentId: "vdep_1" });

    state.findFirst.mockResolvedValueOnce(null);
    await expect(
      mod.getDeploymentByVercelDeploymentIdAnyProject("vdep_1"),
    ).resolves.toBeNull();
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = Object.assign(new Error("missing"), { code: "42P01" });
    state.findFirst.mockRejectedValueOnce(err);

    const { getDeploymentById } = await import("@/lib/data/deployments.server");
    await expect(getDeploymentById("dep_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
