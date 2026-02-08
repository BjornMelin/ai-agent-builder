import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertReturning: vi.fn(),
  updateReturning: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: state.insertReturning,
        }),
        returning: state.insertReturning,
      }),
    }),
    query: {
      runStepsTable: {
        findFirst: state.findFirst,
        findMany: state.findMany,
      },
      runsTable: {
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
});
