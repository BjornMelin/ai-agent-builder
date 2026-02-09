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
  runCodeModeSession: vi.fn(),
}));

const artifactsMocks = vi.hoisted(() => ({
  createCodeModeSummaryArtifact: vi.fn(),
}));

const workflowErrorMocks = vi.hoisted(() => ({
  isWorkflowRunCancelledError: vi.fn(),
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

    artifactsMocks.createCodeModeSummaryArtifact.mockResolvedValue({
      artifactId: "artifact_1",
      version: 1,
    });

    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValue(false);
  });

  it("completes successfully and emits terminal status", async () => {
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
    expect(writerMocks.closeCodeModeStream).toHaveBeenCalledWith(
      state.writable,
    );
  });

  it("marks the active step failed when a non-cancel error is thrown mid-step", async () => {
    const failure = new Error("artifact explode");
    artifactsMocks.createCodeModeSummaryArtifact.mockRejectedValueOnce(failure);

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

    await expect(projectCodeMode("run_1")).rejects.toBe(cancellationError);

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        status: "canceled",
        stepId: "artifact.code_mode_summary",
      }),
    );
    expect(persistMocks.cancelRunAndSteps).toHaveBeenCalledWith("run_1");
    expect(writerMocks.closeCodeModeStream).toHaveBeenCalledWith(
      state.writable,
    );
  });
});
