import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cancelRun: vi.fn(),
  createRun: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
  getRunById: vi.fn(),
  logError: vi.fn(),
  setRunWorkflowRunId: vi.fn(),
  start: vi.fn(),
  updateRunStatus: vi.fn(),
  workflowCancel: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
  start: state.start,
}));

vi.mock("@/lib/core/log", () => ({
  log: {
    error: state.logError,
  },
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/data/runs.server", () => ({
  cancelRun: state.cancelRun,
  createRun: state.createRun,
  getRunById: state.getRunById,
  setRunWorkflowRunId: state.setRunWorkflowRunId,
  updateRunStatus: state.updateRunStatus,
}));

vi.mock("@/workflows/runs/project-run.workflow", () => ({
  projectRun: vi.fn(),
}));

import {
  cancelProjectRun,
  startProjectRun,
} from "@/lib/runs/project-run.server";

beforeEach(() => {
  vi.clearAllMocks();
  state.workflowCancel.mockResolvedValue(undefined);
  state.getRun.mockReturnValue({
    cancel: state.workflowCancel,
  });
  state.getRunById.mockResolvedValue({
    id: "run_1",
    projectId: "project_1",
    status: "running",
    workflowRunId: "wf_1",
  });
  state.cancelRun.mockResolvedValue(undefined);
  state.getProjectByIdForUser.mockResolvedValue({ id: "project_1" });
  state.createRun.mockResolvedValue({ id: "run_1" });
  state.start.mockResolvedValue({ runId: "wf_1" });
  state.setRunWorkflowRunId.mockResolvedValue({
    id: "run_1",
    workflowRunId: "wf_1",
  });
  state.updateRunStatus.mockResolvedValue(undefined);
});

describe("cancelProjectRun", () => {
  it("logs and continues when workflow cancel throws", async () => {
    const error = new Error("cancel failed");
    state.workflowCancel.mockRejectedValueOnce(error);

    await cancelProjectRun("run_1", "user_1");

    expect(state.logError).toHaveBeenCalledWith(
      "workflow_run_cancel_failed",
      expect.objectContaining({
        err: error,
        runId: "run_1",
        workflowRunId: "wf_1",
      }),
    );
    expect(state.cancelRun).toHaveBeenCalledWith("run_1");
  });

  it("does not log when workflow cancel succeeds", async () => {
    await cancelProjectRun("run_1", "user_1");

    expect(state.logError).not.toHaveBeenCalled();
    expect(state.cancelRun).toHaveBeenCalledWith("run_1");
  });

  it("cancels persistence when workflowRunId is null", async () => {
    state.getRunById.mockResolvedValueOnce({
      id: "run_1",
      projectId: "project_1",
      status: "running",
      workflowRunId: null,
    });

    await cancelProjectRun("run_1", "user_1");

    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.cancelRun).toHaveBeenCalledWith("run_1");
  });
});

describe("startProjectRun", () => {
  it("marks run failed and rethrows when workflow start fails", async () => {
    const error = new Error("start failed");
    state.start.mockRejectedValueOnce(error);

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow(error);

    expect(state.updateRunStatus).toHaveBeenCalledWith("run_1", "failed");
    expect(state.setRunWorkflowRunId).not.toHaveBeenCalled();
  });

  it("marks run failed and rethrows when workflowRunId persistence fails", async () => {
    const error = new Error("persist failed");
    state.setRunWorkflowRunId.mockRejectedValueOnce(error);

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow(error);

    expect(state.updateRunStatus).toHaveBeenCalledWith("run_1", "failed");
  });

  it("logs when start compensation update fails", async () => {
    const startError = new Error("start failed");
    const compensationError = new Error("update failed");
    state.start.mockRejectedValueOnce(startError);
    state.updateRunStatus.mockRejectedValueOnce(compensationError);

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow(startError);

    expect(state.logError).toHaveBeenCalledWith(
      "run_start_compensation_failed",
      {
        err: compensationError,
        runId: "run_1",
      },
    );
  });
});
