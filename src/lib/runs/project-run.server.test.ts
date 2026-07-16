import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cancelRunSandboxes: vi.fn(),
  completeRunCancellation: vi.fn(),
  createRun: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
  getRunById: vi.fn(),
  getRunByIdUncached: vi.fn(),
  logError: vi.fn(),
  requestRunCancellation: vi.fn(),
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
  getOwnedProjectByIdForUser: state.getProjectByIdForUser,
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/projects/project-lifecycle-lease.server", () => ({
  withActiveProjectLease: async (
    _input: unknown,
    work: () => Promise<unknown>,
  ) => await work(),
}));

vi.mock("@/lib/data/runs.server", () => ({
  completeRunCancellation: state.completeRunCancellation,
  createRun: state.createRun,
  getRunById: state.getRunById,
  getRunByIdUncached: state.getRunByIdUncached,
  requestRunCancellation: state.requestRunCancellation,
  setRunWorkflowRunId: state.setRunWorkflowRunId,
  updateRunStatus: state.updateRunStatus,
}));

vi.mock("@/lib/sandbox/sandbox-cancellation.server", () => ({
  cancelRunSandboxes: state.cancelRunSandboxes,
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
  state.getRunByIdUncached.mockResolvedValue({
    id: "run_1",
    projectId: "project_1",
    status: "running",
    workflowRunId: "wf_1",
  });
  state.cancelRunSandboxes.mockResolvedValue(undefined);
  state.completeRunCancellation.mockResolvedValue(undefined);
  state.getProjectByIdForUser.mockResolvedValue({ id: "project_1" });
  state.requestRunCancellation.mockResolvedValue("requested");
  state.createRun.mockResolvedValue({ id: "run_1" });
  state.start.mockResolvedValue({ runId: "wf_1" });
  state.setRunWorkflowRunId.mockResolvedValue({
    id: "run_1",
    workflowRunId: "wf_1",
  });
  state.updateRunStatus.mockResolvedValue(undefined);
});

describe("cancelProjectRun", () => {
  it("stops sandboxes but keeps the run retryable when workflow cancel throws", async () => {
    const error = new Error("cancel failed");
    state.workflowCancel.mockRejectedValueOnce(error);

    await expect(cancelProjectRun("run_1", "user_1")).rejects.toMatchObject({
      code: "workflow_cancel_failed",
      status: 502,
    });

    expect(state.logError).toHaveBeenCalledWith(
      "workflow_run_cancel_failed",
      expect.objectContaining({
        err: error,
        runId: "run_1",
        workflowRunId: "wf_1",
      }),
    );
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
  });

  it("throws not_found when project is not owned by user", async () => {
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    await expect(cancelProjectRun("run_1", "other_user")).rejects.toThrow(
      expect.objectContaining({ code: "not_found" }),
    );

    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.workflowCancel).not.toHaveBeenCalled();
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
    expect(state.cancelRunSandboxes).not.toHaveBeenCalled();
  });

  it("does not log when workflow cancel succeeds", async () => {
    await cancelProjectRun("run_1", "user_1");

    expect(state.logError).not.toHaveBeenCalled();
    expect(state.completeRunCancellation).toHaveBeenCalledWith("run_1");
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
  });

  it("bypasses a memoized initial row to cancel a Workflow ID published before the fence", async () => {
    state.getRunById.mockResolvedValue({
      id: "run_1",
      projectId: "project_1",
      status: "running",
      workflowRunId: null,
    });

    await cancelProjectRun("run_1", "user_1");

    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.getRunById).toHaveBeenCalledOnce();
    expect(state.getRunByIdUncached).toHaveBeenCalledWith("run_1");
    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).toHaveBeenCalledWith("run_1");
  });

  it("completes cancellation when the authoritative fenced run has no workflow ID", async () => {
    state.getRunById.mockResolvedValue({
      id: "run_1",
      projectId: "project_1",
      status: "running",
      workflowRunId: null,
    });
    state.getRunByIdUncached.mockResolvedValue({
      id: "run_1",
      projectId: "project_1",
      status: "running",
      workflowRunId: null,
    });

    await cancelProjectRun("run_1", "user_1");

    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).toHaveBeenCalledWith("run_1");
  });

  it("retries a concurrently completed cancellation using the authoritative Workflow ID", async () => {
    state.getRunById.mockResolvedValue({
      id: "run_1",
      projectId: "project_1",
      status: "running",
      workflowRunId: null,
    });
    state.getRunByIdUncached.mockResolvedValue({
      id: "run_1",
      projectId: "project_1",
      status: "canceled",
      workflowRunId: "wf_1",
    });
    state.requestRunCancellation.mockResolvedValueOnce("terminal");

    await cancelProjectRun("run_1", "user_1");

    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
  });

  it("does not terminalize the run when sandbox shutdown fails", async () => {
    const error = new Error("sandbox stop failed");
    state.cancelRunSandboxes.mockRejectedValueOnce(error);

    await expect(cancelProjectRun("run_1", "user_1")).rejects.toThrow(error);

    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
  });

  it("persists the fence before workflow cancellation or sandbox cleanup", async () => {
    const events: string[] = [];
    state.requestRunCancellation.mockImplementationOnce(async () => {
      events.push("fence");
      return "requested";
    });
    state.workflowCancel.mockImplementationOnce(async () => {
      events.push("workflow");
    });
    state.cancelRunSandboxes.mockImplementationOnce(async () => {
      events.push("sandboxes");
    });
    state.completeRunCancellation.mockImplementationOnce(async () => {
      events.push("complete");
    });

    await cancelProjectRun("run_1", "user_1");

    expect(events).toEqual(["fence", "workflow", "sandboxes", "complete"]);
  });

  it("repairs leaked sandbox resources for an already-terminal run", async () => {
    state.getRunById.mockResolvedValueOnce({
      id: "run_1",
      projectId: "project_1",
      status: "succeeded",
      workflowRunId: "wf_1",
    });

    await cancelProjectRun("run_1", "user_1");

    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.requestRunCancellation).not.toHaveBeenCalled();
    expect(state.workflowCancel).not.toHaveBeenCalled();
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
  });

  it("retries Workflow cancellation for an already-canceled app run", async () => {
    state.getRunById.mockResolvedValueOnce({
      id: "run_1",
      projectId: "project_1",
      status: "canceled",
      workflowRunId: "wf_1",
    });

    await cancelProjectRun("run_1", "user_1");

    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.requestRunCancellation).not.toHaveBeenCalled();
  });

  it("still repairs sandboxes when terminal Workflow cancellation needs another retry", async () => {
    state.getRunById.mockResolvedValueOnce({
      id: "run_1",
      projectId: "project_1",
      status: "canceled",
      workflowRunId: "wf_1",
    });
    state.workflowCancel.mockRejectedValueOnce(new Error("cancel failed"));

    await expect(cancelProjectRun("run_1", "user_1")).rejects.toMatchObject({
      code: "workflow_cancel_failed",
      status: 502,
    });

    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
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

  it("fences and confirms cleanup before terminalizing a started workflow", async () => {
    const error = new Error("persist failed");
    state.setRunWorkflowRunId.mockRejectedValueOnce(error);
    const events: string[] = [];
    state.requestRunCancellation.mockImplementationOnce(async () => {
      events.push("fence");
      return "requested";
    });
    state.workflowCancel.mockImplementationOnce(async () => {
      events.push("workflow");
    });
    state.cancelRunSandboxes.mockImplementationOnce(async () => {
      events.push("sandboxes");
    });
    state.completeRunCancellation.mockImplementationOnce(async () => {
      events.push("complete");
    });

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow(error);

    expect(events).toEqual(["fence", "workflow", "sandboxes", "complete"]);
    expect(state.updateRunStatus).not.toHaveBeenCalled();
  });

  it("leaves the started run fenced and nonterminal when cleanup fails", async () => {
    state.setRunWorkflowRunId.mockRejectedValueOnce(
      new Error("persist failed"),
    );
    state.cancelRunSandboxes.mockRejectedValueOnce(
      new Error("sandbox cleanup failed"),
    );

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow("persist failed");

    expect(state.requestRunCancellation).toHaveBeenCalledWith("run_1");
    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
    expect(state.updateRunStatus).not.toHaveBeenCalled();
  });

  it("cancels its known Workflow even when the app run became terminal", async () => {
    state.setRunWorkflowRunId.mockRejectedValueOnce(
      new Error("run became terminal"),
    );
    state.requestRunCancellation.mockResolvedValueOnce("terminal");

    await expect(
      startProjectRun({
        kind: "research",
        projectId: "project_1",
        userId: "user_1",
      }),
    ).rejects.toThrow("run became terminal");

    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.workflowCancel).toHaveBeenCalledOnce();
    expect(state.cancelRunSandboxes).toHaveBeenCalledWith("run_1");
    expect(state.completeRunCancellation).not.toHaveBeenCalled();
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
