import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectById: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
  updateChatThreadByWorkflowRunId: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/chat.server", () => ({
  getChatThreadByWorkflowRunId: state.getChatThreadByWorkflowRunId,
  updateChatThreadByWorkflowRunId: state.updateChatThreadByWorkflowRunId,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectById: state.getProjectById,
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/cancel/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getChatThreadByWorkflowRunId.mockResolvedValue({
    projectId: "proj_1",
    status: "running",
  });
  state.getProjectById.mockResolvedValue({ id: "proj_1" });
  state.getRun.mockReturnValue({ cancel: vi.fn() });
  state.updateChatThreadByWorkflowRunId.mockResolvedValue(undefined);
});

describe("POST /api/chat/:runId/cancel", () => {
  it("requires authentication before canceling", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns not found when the chat session does not exist", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns forbidden when the session's project is not accessible", async () => {
    const POST = await loadRoute();
    state.getProjectById.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(403);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns not found when the workflow run handle is missing", async () => {
    const POST = await loadRoute();
    state.getRun.mockReturnValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(state.updateChatThreadByWorkflowRunId).not.toHaveBeenCalled();
  });

  it("returns conflict when the chat session is terminal", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      projectId: "proj_1",
      status: "succeeded",
    });

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(409);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.updateChatThreadByWorkflowRunId).not.toHaveBeenCalled();
  });
  it("cancels the workflow run and updates persistence", async () => {
    const POST = await loadRoute();
    const cancel = vi.fn().mockResolvedValue(undefined);
    state.getRun.mockReturnValueOnce({ cancel });

    const res = await POST(
      new Request("http://localhost/api/chat/run_1/cancel", { method: "POST" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state.updateChatThreadByWorkflowRunId).toHaveBeenCalledTimes(1);
  });
});
