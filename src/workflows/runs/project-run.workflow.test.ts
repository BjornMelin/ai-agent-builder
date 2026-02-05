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
  closeRunStream: vi.fn(),
  writeRunEvent: vi.fn(),
}));

const artifactsMocks = vi.hoisted(() => ({
  createRunSummaryArtifact: vi.fn(),
}));

const workflowErrorMocks = vi.hoisted(() => ({
  isWorkflowRunCancelledError: vi.fn(),
}));

vi.mock("workflow", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: state.workflowRunId }),
  getWritable: () => state.writable,
}));

vi.mock("@/workflows/runs/steps/persist.step", () => persistMocks);
vi.mock("@/workflows/runs/steps/writer.step", () => writerMocks);
vi.mock("@/workflows/runs/steps/artifacts.step", () => artifactsMocks);
vi.mock("@/workflows/runs/workflow-errors", () => workflowErrorMocks);

import { projectRun } from "./project-run.workflow";

describe("projectRun", () => {
  beforeEach(() => {
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

    writerMocks.closeRunStream.mockResolvedValue(undefined);
    writerMocks.writeRunEvent.mockResolvedValue(undefined);

    artifactsMocks.createRunSummaryArtifact.mockResolvedValue({
      artifactId: "artifact_1",
    });

    workflowErrorMocks.isWorkflowRunCancelledError.mockReturnValue(false);
  });

  it("marks the active step failed when a non-cancel error is thrown mid-step", async () => {
    const failure = new Error("artifact explode");
    artifactsMocks.createRunSummaryArtifact.mockRejectedValueOnce(failure);

    await expect(projectRun("run_1")).rejects.toThrow("artifact explode");

    expect(persistMocks.finishRunStep).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: "artifact explode" },
        runId: "run_1",
        status: "failed",
        stepId: "artifact.run_summary",
      }),
    );

    expect(writerMocks.writeRunEvent).toHaveBeenCalledWith(
      state.writable,
      expect.objectContaining({
        error: { message: "artifact explode" },
        runId: "run_1",
        status: "failed",
        stepId: "artifact.run_summary",
        type: "step-finished",
      }),
    );

    expect(persistMocks.markRunTerminal).toHaveBeenCalledWith(
      "run_1",
      "failed",
    );
    expect(persistMocks.cancelRunAndSteps).not.toHaveBeenCalled();
    expect(writerMocks.closeRunStream).toHaveBeenCalledWith(state.writable);
  });
});
