import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createArtifactVersion: vi.fn(),
  enqueueArtifactIndexing: vi.fn(),
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  createArtifactVersion: state.createArtifactVersion,
}));

vi.mock("@/lib/artifacts/enqueue-indexing.server", () => ({
  enqueueArtifactIndexing: state.enqueueArtifactIndexing,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.createArtifactVersion.mockResolvedValue({
    id: "art_1",
    kind: "RUN_SUMMARY",
    logicalKey: "run:run_1",
    projectId: "proj_1",
    version: 1,
  });
});

describe("createRunSummaryArtifact", () => {
  it("creates a run summary artifact and enqueues indexing", async () => {
    const { createRunSummaryArtifact } = await import(
      "@/workflows/runs/steps/artifacts.step"
    );

    const res = await createRunSummaryArtifact({
      kind: "research",
      projectId: "proj_1",
      runId: "run_1",
      status: "succeeded",
      workflowRunId: "wf_1",
    });

    expect(res).toEqual({ artifactId: "art_1", version: 1 });
    expect(state.createArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "RUN_SUMMARY",
        logicalKey: "run:run_1",
        projectId: "proj_1",
        runId: "run_1",
      }),
    );
    expect(state.enqueueArtifactIndexing).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: "art_1",
        projectId: "proj_1",
        version: 1,
      }),
    );
  });
});
