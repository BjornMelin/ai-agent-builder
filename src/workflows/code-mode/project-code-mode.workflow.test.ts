import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  workflowRunId: "wf_1",
  writable: {} as WritableStream<unknown>,
}));

const persistMocks = vi.hoisted(() => ({
  beginRunStep: vi.fn(),
  cancelRunAndSteps: vi.fn(),
  ensureRunStepRow: vi.fn(),
  finishRunStep: vi.fn(),
  getRunInfo: vi.fn(),
  markRunRunning: vi.fn(),
  markRunTerminal: vi.fn(),
}));

const writerMocks = vi.hoisted(() => ({
  closeCodeModeStream: vi.fn(),
  writeCodeModeEvent: vi.fn(),
}));

const codeModeMocks = vi.hoisted(() => ({
  getCodeModeRunStatus: vi.fn(),
  runCodeModeSession: vi.fn(),
}));

const artifactsMocks = vi.hoisted(() => ({
  createCodeModeSummaryArtifact: vi.fn(),
}));

const workflowErrorMocks = vi.hoisted(() => ({
  isWorkflowRunCancelledError: vi.fn(),
}));

const registrationMocks = vi.hoisted(() => ({
  registerCodeModeWorkflow: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: state.workflowRunId }),
  getWritable: () => state.writable,
}));

vi.mock("@/workflows/runs/steps/persist.step", () => persistMocks);
vi.mock("@/workflows/code-mode/steps/writer.step", () => writerMocks);
vi.mock("@/workflows/code-mode/steps/code-mode.step", () => codeModeMocks);
vi.mock("@/workflows/code-mode/steps/artifacts.step", () => artifactsMocks);
vi.mock("@/workflows/runs/workflow-errors", () => workflowErrorMocks);
vi.mock(
  "@/workflows/code-mode/steps/register-workflow.step",
  () => registrationMocks,
);

import { projectCodeMode } from "./project-code-mode.workflow";

describe("projectCodeMode", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    persistMocks.beginRunStep.mockResolvedValue(undefined);
    persistMocks.cancelRunAndSteps.mockResolvedValue(undefined);
    persistMocks.ensureRunStepRow.mockResolvedValue(undefined);
    persistMocks.finishRunStep.mockResolvedValue(undefined);
    persistMocks.getRunInfo.mockResolvedValue({
      kind: "research",
      projectId: "project_1",
    });
    persistMocks.markRunRunning.mockResolvedValue(undefined);
    persistMocks.markRunTerminal.mockResolvedValue(undefined);

    writerMocks.closeCodeModeStream.mockResolvedValue(undefined);
    writerMocks.writeCodeModeEvent.mockResolvedValue(undefined);

    codeModeMocks.runCodeModeSession.mockResolvedValue({
      assistantText: "ok",
      jobId: "job_1",
      prompt: "hello",
      transcriptBlobRef: null,
      transcriptTruncated: false,
    });
    codeModeMocks.getCodeModeRunStatus.mockResolvedValue("succeeded");

    artifactsMocks.createCodeModeSummaryArtifact.mockResolvedValue({
      artifactId: "artifact_1",
      version: 1,
    });

    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValue(false);
    registrationMocks.registerCodeModeWorkflow.mockResolvedValue(true);
  });

  it("exits before side effects when another workflow owns the run", async () => {
    registrationMocks.registerCodeModeWorkflow.mockResolvedValueOnce(false);

    await expect(projectCodeMode("run_1")).resolves.toEqual({ ok: true });

    expect(registrationMocks.registerCodeModeWorkflow).toHaveBeenCalledWith(
      "run_1",
      "wf_1",
    );
    expect(codeModeMocks.runCodeModeSession).not.toHaveBeenCalled();
    expect(persistMocks.markRunRunning).not.toHaveBeenCalled();
    expect(artifactsMocks.createCodeModeSummaryArtifact).not.toHaveBeenCalled();
  });

  it("completes successfully and emits terminal status", async () => {
    const order: string[] = [];
    artifactsMocks.createCodeModeSummaryArtifact.mockImplementationOnce(
      async () => {
        order.push("artifact-created");
        return { artifactId: "artifact_1", version: 1 };
      },
    );
    persistMocks.finishRunStep.mockImplementation(async (input) => {
      if (
        input.stepId === "artifact.code_mode_summary" &&
        input.status === "succeeded"
      ) {
        order.push("artifact-step-succeeded");
      }
    });
    persistMocks.markRunTerminal.mockImplementationOnce(async () => {
      order.push("run-succeeded");
    });
    codeModeMocks.getCodeModeRunStatus.mockImplementationOnce(async () => {
      order.push("status-read");
      return "succeeded";
    });
    writerMocks.writeCodeModeEvent.mockImplementation(
      async (_writable, event) => {
        if (event.type === "terminal") {
          order.push(`stream-${event.status}`);
        }
      },
    );

    await expect(projectCodeMode("run_1")).resolves.toEqual({ ok: true });

    expect(persistMocks.markRunRunning).toHaveBeenCalledWith("run_1");
    expect(codeModeMocks.runCodeModeSession).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_1", workflowRunId: "wf_1" }),
    );

    expect(artifactsMocks.createCodeModeSummaryArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        runId: "run_1",
        workflowRunId: "wf_1",
      }),
    );

    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "succeeded",
    );
    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "succeeded", type: "terminal" }),
    );
    expect(order).toEqual([
      "artifact-created",
      "artifact-step-succeeded",
      "run-succeeded",
      "status-read",
      "stream-succeeded",
    ]);
    expect(writerMocks.closeCodeModeStream).toHaveBeenCalledWith(
      state.writable,
    );
  });

  it("marks the active step failed when a non-cancel error is thrown mid-step", async () => {
    const failure = new Error("artifact explode");
    artifactsMocks.createCodeModeSummaryArtifact.mockRejectedValueOnce(failure);
    codeModeMocks.getCodeModeRunStatus.mockResolvedValueOnce("failed");

    await expect(projectCodeMode("run_1")).rejects.toThrow("artifact explode");

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: "artifact explode" },
        runId: "run_1",
        status: "failed",
        stepId: "artifact.code_mode_summary",
      }),
    );

    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "failed", type: "terminal" }),
    );
    expect(writerMocks.closeCodeModeStream).toHaveBeenCalledWith(
      state.writable,
    );
  });

  it("persists cancellation when a cancellation error occurs mid-step", async () => {
    const cancellationError = new Error("cancelled");
    artifactsMocks.createCodeModeSummaryArtifact.mockRejectedValueOnce(
      cancellationError,
    );
    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValueOnce(true);
    codeModeMocks.getCodeModeRunStatus.mockResolvedValueOnce("canceled");

    await expect(projectCodeMode("run_1")).rejects.toBe(cancellationError);

    expect(persistMocks.cancelRunAndSteps).toHaveBeenCalledWith("run_1");
    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "canceled", type: "terminal" }),
    );
    expect(writerMocks.closeCodeModeStream).toHaveBeenCalledWith(
      state.writable,
    );
  });

  it("persists cancellation when the sandbox cancellation fence wins", async () => {
    const cancellationError = Object.assign(new Error("sandbox canceled"), {
      code: "sandbox_job_canceled",
    });
    codeModeMocks.runCodeModeSession.mockRejectedValueOnce(cancellationError);
    codeModeMocks.getCodeModeRunStatus.mockResolvedValueOnce("canceled");

    await expect(projectCodeMode("run_1")).rejects.toBe(cancellationError);

    expect(persistMocks.cancelRunAndSteps).toHaveBeenCalledWith("run_1");
    expect(persistMocks.markRunTerminal).not.toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "canceled", type: "terminal" }),
    );
  });

  it("emits no terminal event when failure persistence cannot be confirmed", async () => {
    artifactsMocks.createCodeModeSummaryArtifact.mockRejectedValueOnce(
      new Error("artifact explode"),
    );
    persistMocks.markRunTerminal.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(projectCodeMode("run_1")).rejects.toThrow("artifact explode");

    expect(codeModeMocks.getCodeModeRunStatus).not.toHaveBeenCalled();
    expect(writerMocks.writeCodeModeEvent).not.toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ type: "terminal" }),
    );
  });

  it("emits the persisted status when another terminal state wins", async () => {
    artifactsMocks.createCodeModeSummaryArtifact.mockRejectedValueOnce(
      new Error("artifact explode"),
    );
    codeModeMocks.getCodeModeRunStatus.mockResolvedValueOnce("canceled");

    await expect(projectCodeMode("run_1")).rejects.toThrow("artifact explode");

    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "canceled", type: "terminal" }),
    );
    expect(writerMocks.writeCodeModeEvent).not.toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "failed", type: "terminal" }),
    );
  });

  it("does not emit success when persistence reports a concurrent cancellation", async () => {
    codeModeMocks.getCodeModeRunStatus.mockResolvedValue("canceled");

    await expect(projectCodeMode("run_1")).rejects.toThrow(
      /terminal-state race/i,
    );

    expect(writerMocks.writeCodeModeEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "canceled", type: "terminal" }),
    );
    expect(writerMocks.writeCodeModeEvent).not.toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({ status: "succeeded", type: "terminal" }),
    );
  });
});
