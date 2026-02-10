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
      approvalsTable: {
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

describe("approvals DAL", () => {
  it("listPendingApprovals clamps limit and tags cache", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        approvedAt: null,
        approvedBy: null,
        createdAt: now,
        id: "approval_1",
        intentSummary: "merge",
        metadata: {},
        projectId: "proj_1",
        runId: "run_1",
        scope: "repo.merge",
        stepId: null,
      },
    ]);

    const { listPendingApprovals } = await import(
      "@/lib/data/approvals.server"
    );
    await expect(
      listPendingApprovals("proj_1", { limit: 9999 }),
    ).resolves.toMatchObject([{ id: "approval_1" }]);

    expect(state.cacheTag).toHaveBeenCalledWith(
      expect.stringContaining("approvals:index:proj_1"),
    );
    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 500 }),
    );
  });

  it("createApprovalRequest is idempotent for pending approvals", async () => {
    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      approvedAt: null,
      approvedBy: null,
      createdAt: now,
      id: "approval_existing",
      intentSummary: "merge",
      metadata: {},
      projectId: "proj_1",
      runId: "run_1",
      scope: "repo.merge",
      stepId: null,
    });

    const { createApprovalRequest } = await import(
      "@/lib/data/approvals.server"
    );
    await expect(
      createApprovalRequest({
        intentSummary: "merge",
        projectId: "proj_1",
        runId: "run_1",
        scope: "repo.merge",
      }),
    ).resolves.toMatchObject({ id: "approval_existing" });

    expect(state.insertReturning).not.toHaveBeenCalled();
  });

  it("approveApprovalRequest throws not_found when update returns no rows", async () => {
    state.updateReturning.mockResolvedValueOnce([]);
    const { approveApprovalRequest } = await import(
      "@/lib/data/approvals.server"
    );

    await expect(
      approveApprovalRequest({ approvalId: "missing", approvedBy: "user" }),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("wraps undefined-table/column errors into db_not_migrated", async () => {
    const err = Object.assign(new Error("missing"), { code: "42703" });
    state.findFirst.mockRejectedValueOnce(err);

    const { getApprovalById } = await import("@/lib/data/approvals.server");
    await expect(getApprovalById("approval_1")).rejects.toMatchObject({
      code: "db_not_migrated",
      status: 500,
    } satisfies Partial<AppError>);
  });
});
