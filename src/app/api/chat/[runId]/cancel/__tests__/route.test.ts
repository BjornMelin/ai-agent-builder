import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  closeStream: vi.fn(),
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
  listStreamsByRunId: vi.fn(),
  requireAppUserApi: vi.fn(),
  transitionChatThreadState: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/chat.server", () => ({
  getChatThreadByWorkflowRunId: state.getChatThreadByWorkflowRunId,
}));

vi.mock("@/lib/data/chat-thread-state.server", () => ({
  transitionChatThreadState: state.transitionChatThreadState,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

vi.mock("workflow/runtime", () => ({
  getWorld: () => ({
    closeStream: state.closeStream,
    listStreamsByRunId: state.listStreamsByRunId,
  }),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/cancel/route");
  return mod.POST;
}

function request() {
  return new Request("http://localhost/api/chat/run_1/cancel", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getChatThreadByWorkflowRunId.mockResolvedValue({
    projectId: "proj_1",
    status: "running",
  });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.getRun.mockReturnValue({ cancel: vi.fn() });
  state.listStreamsByRunId.mockResolvedValue(["default", "assistant-turn-1"]);
  state.closeStream.mockResolvedValue(undefined);
  state.transitionChatThreadState.mockResolvedValue({
    changed: true,
    id: "thread_1",
    status: "canceled",
    updatedAt: new Date(),
  });
});

describe("POST /api/chat/:runId/cancel", () => {
  it("requires authentication and project authorization before status disclosure", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      projectId: "proj_1",
      status: "succeeded",
    });
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(403);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.transitionChatThreadState).not.toHaveBeenCalled();
  });

  it("returns not found when the persisted chat session is missing", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(404);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it.each([
    "succeeded",
    "failed",
  ] as const)("returns an existing %s state as the authoritative idempotent result", async (status) => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      projectId: "proj_1",
      status,
    });

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, status });
    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.transitionChatThreadState).not.toHaveBeenCalled();
  });

  it("retries workflow cancellation for an already persisted canceled state", async () => {
    const POST = await loadRoute();
    const cancel = vi.fn().mockResolvedValue(undefined);
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      projectId: "proj_1",
      status: "canceled",
    });
    state.getRun.mockReturnValueOnce({ cancel });

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      status: "canceled",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state.listStreamsByRunId).toHaveBeenCalledWith("run_1");
    expect(state.closeStream).toHaveBeenCalledTimes(2);
    expect(state.transitionChatThreadState).not.toHaveBeenCalled();
  });

  it("returns not found when the active workflow handle is missing", async () => {
    const POST = await loadRoute();
    state.getRun.mockReturnValueOnce(undefined);

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(404);
    expect(state.transitionChatThreadState).not.toHaveBeenCalled();
  });

  it("persists the authoritative terminal transition before canceling the run", async () => {
    const POST = await loadRoute();
    const cancel = vi.fn().mockResolvedValue(undefined);
    state.getRun.mockReturnValueOnce({ cancel });

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      status: "canceled",
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state.listStreamsByRunId).toHaveBeenCalledWith("run_1");
    expect(state.closeStream).toHaveBeenCalledWith("default", "run_1");
    expect(state.closeStream).toHaveBeenCalledWith("assistant-turn-1", "run_1");
    expect(state.transitionChatThreadState).toHaveBeenCalledWith({
      status: "canceled",
      workflowRunId: "run_1",
    });
    expect(
      state.transitionChatThreadState.mock.invocationCallOrder[0],
    ).toBeLessThan(
      cancel.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      state.closeStream.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("returns the workflow terminal state when it wins the cancellation race", async () => {
    const POST = await loadRoute();
    state.transitionChatThreadState.mockResolvedValueOnce({
      changed: false,
      id: "thread_1",
      status: "succeeded",
      updatedAt: new Date(),
    });

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      status: "succeeded",
    });
    expect(state.getRun().cancel).not.toHaveBeenCalled();
  });

  it("does not report success when authoritative persistence fails", async () => {
    const POST = await loadRoute();
    state.transitionChatThreadState.mockRejectedValueOnce(
      new Error("db timeout"),
    );

    const res = await POST(request(), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "internal_error" },
    });
    expect(state.getRun().cancel).not.toHaveBeenCalled();
  });
});
