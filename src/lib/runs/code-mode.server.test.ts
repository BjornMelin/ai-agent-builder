import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claimCodeModeWorkflow: vi.fn(),
  ensureCodeModeRun: vi.fn(),
  getActiveCodeModeRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRunById: vi.fn(),
  start: vi.fn(),
}));

vi.mock("workflow/api", () => ({ start: state.start }));

vi.mock("@/lib/data/projects.server", () => ({
  getOwnedProjectByIdForUser: state.getProjectByIdForUser,
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/data/runs.server", () => ({
  getRunById: state.getRunById,
}));

vi.mock("@/lib/runs/code-mode-start.server", () => ({
  claimCodeModeWorkflow: state.claimCodeModeWorkflow,
  ensureCodeModeRun: state.ensureCodeModeRun,
  getActiveCodeModeRunId: state.getActiveCodeModeRunId,
}));

vi.mock("@/workflows/code-mode/project-code-mode.workflow", () => ({
  projectCodeMode: vi.fn(),
}));

import { startProjectCodeMode } from "@/lib/runs/code-mode.server";

const pendingRun = {
  createdAt: new Date(0).toISOString(),
  id: "00000000-0000-4000-8000-000000000001",
  kind: "research",
  metadata: { origin: "code-mode", prompt: "hello" },
  projectId: "project_1",
  status: "pending",
  updatedAt: new Date(0).toISOString(),
  workflowRunId: null,
} as const;

const startInput = {
  projectId: "project_1",
  prompt: "hello",
  runId: pendingRun.id,
  userId: "user_1",
} as const;

beforeEach(() => {
  vi.resetAllMocks();
  state.getProjectByIdForUser.mockResolvedValue({ id: "project_1" });
  state.ensureCodeModeRun.mockResolvedValue(undefined);
  state.start.mockResolvedValue({ runId: "wf_1" });
  state.claimCodeModeWorkflow.mockResolvedValue(true);
  state.getRunById
    .mockResolvedValueOnce(pendingRun)
    .mockResolvedValue({ ...pendingRun, workflowRunId: "wf_1" });
});

describe("startProjectCodeMode", () => {
  it("throws not_found before creating a run when project is inaccessible", async () => {
    state.ensureCodeModeRun.mockRejectedValueOnce(
      Object.assign(new Error("Project not found."), { code: "not_found" }),
    );

    await expect(startProjectCodeMode(startInput)).rejects.toMatchObject({
      code: "not_found",
    });

    expect(state.ensureCodeModeRun).toHaveBeenCalledOnce();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("creates the client-known run and links the accepted workflow", async () => {
    await expect(startProjectCodeMode(startInput)).resolves.toMatchObject({
      id: pendingRun.id,
      workflowRunId: "wf_1",
    });

    expect(state.ensureCodeModeRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: pendingRun.id, userId: "user_1" }),
    );
    expect(state.claimCodeModeWorkflow).toHaveBeenCalledWith(
      pendingRun.id,
      "wf_1",
    );
  });

  it("returns an already linked idempotent run without another start", async () => {
    state.getRunById.mockReset();
    state.getRunById.mockResolvedValue({
      ...pendingRun,
      workflowRunId: "wf_existing",
    });

    await expect(startProjectCodeMode(startInput)).resolves.toMatchObject({
      workflowRunId: "wf_existing",
    });
    expect(state.start).not.toHaveBeenCalled();
  });

  it("recovers when start throws after the queued workflow self-links", async () => {
    state.start.mockRejectedValueOnce(new Error("response lost"));
    state.getRunById.mockReset();
    state.getRunById
      .mockResolvedValueOnce(pendingRun)
      .mockResolvedValueOnce({ ...pendingRun, workflowRunId: "wf_accepted" });

    await expect(startProjectCodeMode(startInput)).resolves.toMatchObject({
      workflowRunId: "wf_accepted",
    });
    expect(state.claimCodeModeWorkflow).not.toHaveBeenCalled();
  });

  it("leaves an unlinked canonical run retryable after an unaccepted start", async () => {
    const error = new Error("queue unavailable");
    state.start.mockRejectedValueOnce(error);
    state.getRunById.mockReset();
    state.getRunById.mockResolvedValue(pendingRun);

    await expect(startProjectCodeMode(startInput)).rejects.toBe(error);
    expect(state.ensureCodeModeRun).toHaveBeenCalledTimes(1);
  });

  it("returns one canonical owner across concurrent retry envelopes", async () => {
    let canonicalWorkflowId: string | null = null;
    let releaseStarts: (() => void) | null = null;
    const bothStarted = new Promise<void>((resolve) => {
      releaseStarts = resolve;
    });
    let startCount = 0;
    state.getRunById.mockReset();
    state.getRunById.mockImplementation(async () => ({
      ...pendingRun,
      workflowRunId: canonicalWorkflowId,
    }));
    state.start.mockImplementation(async () => {
      startCount += 1;
      const workflowRunId = `wf_${startCount}`;
      if (startCount === 2) releaseStarts?.();
      await bothStarted;
      return { runId: workflowRunId };
    });
    state.claimCodeModeWorkflow.mockImplementation(
      async (_runId: string, workflowRunId: string) => {
        if (!canonicalWorkflowId) {
          canonicalWorkflowId = workflowRunId;
          return true;
        }
        return canonicalWorkflowId === workflowRunId;
      },
    );

    const [first, second] = await Promise.all([
      startProjectCodeMode(startInput),
      startProjectCodeMode(startInput),
    ]);

    expect(state.start).toHaveBeenCalledTimes(2);
    expect(state.claimCodeModeWorkflow).toHaveBeenCalledTimes(2);
    expect(first.workflowRunId).toBe(canonicalWorkflowId);
    expect(second.workflowRunId).toBe(canonicalWorkflowId);
  });
});
