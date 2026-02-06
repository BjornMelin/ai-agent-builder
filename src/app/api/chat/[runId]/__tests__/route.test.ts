import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  requireAppUserApi: vi.fn(),
  resume: vi.fn(),
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
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/workflows/chat/hooks/chat-message", () => ({
  chatMessageHook: { resume: state.resume },
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.resume.mockResolvedValue(undefined);
  state.getChatThreadByWorkflowRunId.mockResolvedValue({
    projectId: "proj_1",
    status: "running",
  });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.updateChatThreadByWorkflowRunId.mockResolvedValue(undefined);
});

describe("POST /api/chat/:runId", () => {
  it("rejects invalid JSON bodies", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: "{",
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns not found when the chat session is missing", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("returns conflict when the chat session is terminal", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      projectId: "proj_1",
      status: "succeeded",
    });

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(409);
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("resumes the workflow hook with the provided message", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.resume).toHaveBeenCalledWith("run_1", { message: "hello" });
    expect(state.updateChatThreadByWorkflowRunId).toHaveBeenCalledWith(
      "run_1",
      {
        lastActivityAt: expect.any(Date),
        status: "running",
      },
    );
  });

  it("sets status to waiting when the message is /done", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "/done" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.resume).toHaveBeenCalledWith("run_1", { message: "/done" });
    expect(state.updateChatThreadByWorkflowRunId).toHaveBeenCalledWith(
      "run_1",
      {
        lastActivityAt: expect.any(Date),
        status: "waiting",
      },
    );
  });

  it("still returns ok when state update fails after resume succeeds", async () => {
    const POST = await loadRoute();
    state.updateChatThreadByWorkflowRunId.mockRejectedValueOnce(
      new Error("db timeout"),
    );

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.resume).toHaveBeenCalledWith("run_1", { message: "hello" });
  });
});
