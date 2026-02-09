import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  cancelRunAndStepsTx: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  transaction: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => {
    const query = {
      runStepsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
      runsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
    };

    return {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: state.insertReturning,
          }),
          returning: state.insertReturning,
        }),
      }),
      query,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        await fn({ query }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: state.updateReturning,
          }),
        }),
      }),
    };
  },
}));

vi.mock("@/lib/data/run-cancel-tx", () => ({
  cancelRunAndStepsTx: (...args: unknown[]) =>
    state.cancelRunAndStepsTx(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runs DAL", () => {
  it("createRun returns a DTO and throws if returning is empty", async () => {
    const now = new Date(0);
    state.insertReturning.mockResolvedValueOnce([
      {
        createdAt: now,
        id: "run_1",
        kind: "research",
        metadata: {},
        projectId: "proj_1",
        status: "pending",
        updatedAt: now,
        workflowRunId: null,
      },
    ]);

    const { createRun } = await import("@/lib/data/runs.server");
    const dto = await createRun({ kind: "research", projectId: "proj_1" });

    expect(dto).toMatchObject({
      id: "run_1",
      kind: "research",
      projectId: "proj_1",
    });

    state.insertReturning.mockResolvedValueOnce([]);
    await expect(
      createRun({ kind: "research", projectId: "proj_1" }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("setRunWorkflowRunId wraps update errors and throws not_found when no row is returned", async () => {
    state.updateReturning.mockRejectedValueOnce(new Error("db down"));

    const { setRunWorkflowRunId } = await import("@/lib/data/runs.server");
    await expect(setRunWorkflowRunId("run_1", "wf_1")).rejects.toMatchObject({
      code: "db_update_failed",
      status: 500,
    } satisfies Partial<AppError>);

    state.updateReturning.mockResolvedValueOnce([]);
    await expect(setRunWorkflowRunId("run_1", "wf_1")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("ensureRunStep returns inserted row or falls back to existing row", async () => {
    const now = new Date(0);
    state.insertReturning.mockResolvedValueOnce([
      {
        attempt: 0,
        createdAt: now,
        endedAt: null,
        error: null,
        id: "step_1",
        inputs: {},
        outputs: {},
        runId: "run_1",
        startedAt: null,
        status: "pending",
        stepId: "s1",
        stepKind: "tool",
        stepName: "S1",
        updatedAt: now,
      },
    ]);

    const { ensureRunStep } = await import("@/lib/data/runs.server");
    const dto = await ensureRunStep({
      runId: "run_1",
      stepId: "s1",
      stepKind: "tool",
      stepName: "S1",
    });
    expect(dto).toMatchObject({ id: "step_1", runId: "run_1", stepId: "s1" });

    state.insertReturning.mockResolvedValueOnce([]);
    state.findFirst.mockResolvedValueOnce({
      attempt: 0,
      createdAt: now,
      endedAt: null,
      error: null,
      id: "step_existing",
      inputs: {},
      outputs: {},
      runId: "run_1",
      startedAt: null,
      status: "pending",
      stepId: "s1",
      stepKind: "tool",
      stepName: "S1",
      updatedAt: now,
    });
    const dto2 = await ensureRunStep({
      runId: "run_1",
      stepId: "s1",
      stepKind: "tool",
      stepName: "S1",
    });
    expect(dto2.id).toBe("step_existing");

    state.insertReturning.mockResolvedValueOnce([]);
    state.findFirst.mockResolvedValueOnce(null);
    await expect(
      ensureRunStep({
        runId: "run_1",
        stepId: "s1",
        stepKind: "tool",
        stepName: "S1",
      }),
    ).rejects.toMatchObject({
      code: "db_insert_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("listRunsByProject clamps pagination and maps DTOs", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        createdAt: now,
        id: "run_1",
        kind: "research",
        metadata: {},
        projectId: "proj_1",
        status: "pending",
        updatedAt: now,
        workflowRunId: null,
      },
    ]);

    const { listRunsByProject } = await import("@/lib/data/runs.server");
    await expect(
      listRunsByProject("proj_1", { limit: 999, offset: -10 }),
    ).resolves.toHaveLength(1);

    expect(state.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200, offset: 0 }),
    );
  });

  it("getRunById returns null when missing and DTO when found", async () => {
    state.findFirst.mockResolvedValueOnce(null);

    const { getRunById } = await import("@/lib/data/runs.server");
    await expect(getRunById("run_missing")).resolves.toBeNull();

    const now = new Date(0);
    state.findFirst.mockResolvedValueOnce({
      createdAt: now,
      id: "run_2",
      kind: "implementation",
      metadata: { hello: "world" },
      projectId: "proj_1",
      status: "running",
      updatedAt: now,
      workflowRunId: "wf_1",
    });
    await expect(getRunById("run_2")).resolves.toMatchObject({
      id: "run_2",
      workflowRunId: "wf_1",
    });
  });

  it("listRunSteps maps DTOs ordered by creation time", async () => {
    const now = new Date(0);
    state.findMany.mockResolvedValueOnce([
      {
        attempt: 0,
        createdAt: now,
        endedAt: null,
        error: null,
        id: "step_1",
        inputs: {},
        outputs: {},
        runId: "run_1",
        startedAt: null,
        status: "pending",
        stepId: "s1",
        stepKind: "tool",
        stepName: "S1",
        updatedAt: now,
      },
    ]);

    const { listRunSteps } = await import("@/lib/data/runs.server");
    await expect(listRunSteps("run_1")).resolves.toEqual([
      expect.objectContaining({ createdAt: now.toISOString(), id: "step_1" }),
    ]);
  });

  it("cancelRun throws when missing, skips terminal runs, and cancels otherwise", async () => {
    const { cancelRun } = await import("@/lib/data/runs.server");

    state.findFirst.mockResolvedValueOnce(null);
    await expect(cancelRun("run_missing")).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);

    state.findFirst.mockResolvedValueOnce({ status: "succeeded" });
    await expect(cancelRun("run_terminal")).resolves.toBeUndefined();
    expect(state.cancelRunAndStepsTx).not.toHaveBeenCalled();

    state.findFirst.mockResolvedValueOnce({ status: "running" });
    await expect(cancelRun("run_running")).resolves.toBeUndefined();
    expect(state.cancelRunAndStepsTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: "run_running" }),
    );
  });
});
