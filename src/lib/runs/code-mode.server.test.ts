import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createRun: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
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
  createRun: state.createRun,
  getRunById: vi.fn(),
  setRunWorkflowRunId: state.setRunWorkflowRunId,
  updateRunStatus: state.updateRunStatus,
}));

vi.mock("@/workflows/code-mode/project-code-mode.workflow", () => ({
  projectCodeMode: vi.fn(),
}));

import { startProjectCodeMode } from "@/lib/runs/code-mode.server";

beforeEach(() => {
  vi.clearAllMocks();
  state.workflowCancel.mockResolvedValue(undefined);
  state.getRun.mockReturnValue({ cancel: state.workflowCancel });
  state.getProjectByIdForUser.mockResolvedValue({ id: "project_1" });
  state.createRun.mockResolvedValue({ id: "run_1" });
  state.start.mockResolvedValue({ runId: "wf_1" });
  state.setRunWorkflowRunId.mockResolvedValue({
    id: "run_1",
    workflowRunId: "wf_1",
  });
  state.updateRunStatus.mockResolvedValue(undefined);
});

describe("startProjectCodeMode", () => {
  it("throws not_found when project is not accessible", async () => {
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    await expect(
      startProjectCodeMode({
        projectId: "project_1",
        prompt: "hello",
        userId: "user_1",
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "not_found" }));

    expect(state.createRun).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("marks run failed and rethrows when workflow start fails", async () => {
    const error = new Error("start failed");
    state.start.mockRejectedValueOnce(error);

    await expect(
      startProjectCodeMode({
        projectId: "project_1",
        prompt: "hello",
        userId: "user_1",
      }),
    ).rejects.toThrow(error);

    expect(state.updateRunStatus).toHaveBeenCalledWith("run_1", "failed");
    expect(state.setRunWorkflowRunId).not.toHaveBeenCalled();
  });

  it("cancels the workflow when persisting workflowRunId fails", async () => {
    const error = new Error("persist failed");
    state.setRunWorkflowRunId.mockRejectedValueOnce(error);

    await expect(
      startProjectCodeMode({
        projectId: "project_1",
        prompt: "hello",
        userId: "user_1",
      }),
    ).rejects.toThrow(error);

    expect(state.workflowCancel).toHaveBeenCalled();
    expect(state.updateRunStatus).toHaveBeenCalledWith("run_1", "failed");
  });
});
