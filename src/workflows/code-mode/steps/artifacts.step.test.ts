import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createArtifactVersion: vi.fn(),
  enqueueArtifactIndexing: vi.fn(),
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  createArtifactVersion: (...args: unknown[]) =>
    state.createArtifactVersion(...args),
}));

vi.mock("@/lib/artifacts/enqueue-indexing.server", () => ({
  enqueueArtifactIndexing: (...args: unknown[]) =>
    state.enqueueArtifactIndexing(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.createArtifactVersion.mockResolvedValue({
    id: "artifact_1",
    kind: "CODE_MODE_SUMMARY",
    logicalKey: "code-mode:run_1",
    projectId: "proj_1",
    version: 1,
  });
  state.enqueueArtifactIndexing.mockResolvedValue(undefined);
});

describe("createCodeModeSummaryArtifact", () => {
  it("creates a markdown artifact and enqueues indexing", async () => {
    const { createCodeModeSummaryArtifact } = await import("./artifacts.step");

    await expect(
      createCodeModeSummaryArtifact({
        assistantText: "output",
        projectId: "proj_1",
        prompt: "do it",
        runId: "run_1",
        transcriptBlobRef: "blob_1",
        workflowRunId: "wf_1",
      }),
    ).resolves.toEqual({ artifactId: "artifact_1", version: 1 });

    expect(state.createArtifactVersion).toHaveBeenCalledTimes(1);
    const arg = state.createArtifactVersion.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      kind: "CODE_MODE_SUMMARY",
      logicalKey: "code-mode:run_1",
      projectId: "proj_1",
      runId: "run_1",
    });
    expect(arg?.content?.format).toBe("markdown");
    expect(String(arg?.content?.markdown)).toContain("**Code Mode summary**");
    expect(String(arg?.content?.markdown)).toContain(
      "Sandbox transcript: blob_1",
    );

    expect(state.enqueueArtifactIndexing).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: "artifact_1",
        kind: "CODE_MODE_SUMMARY",
        logicalKey: "code-mode:run_1",
        projectId: "proj_1",
        version: 1,
      }),
    );
  });

  it("records empty assistant output as (empty)", async () => {
    const { createCodeModeSummaryArtifact } = await import("./artifacts.step");

    await createCodeModeSummaryArtifact({
      assistantText: " ",
      projectId: "proj_1",
      prompt: "do it",
      runId: "run_1",
      transcriptBlobRef: null,
      workflowRunId: "wf_1",
    });

    const arg = state.createArtifactVersion.mock.calls[0]?.[0];
    expect(String(arg?.content?.markdown)).toContain("(empty)");
    expect(String(arg?.content?.markdown)).toContain(
      "Sandbox transcript: (not available)",
    );
  });
});
