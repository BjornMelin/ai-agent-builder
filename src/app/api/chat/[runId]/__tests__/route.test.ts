import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  appendChatMessages: vi.fn(),
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  log: (() => {
    const logger = {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    logger.child.mockImplementation(() => logger);
    return logger;
  })(),
  requireAppUserApi: vi.fn(),
  resume: vi.fn(),
  updateChatThreadByWorkflowRunId: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/chat.server", () => ({
  appendChatMessages: state.appendChatMessages,
  getChatThreadByWorkflowRunId: state.getChatThreadByWorkflowRunId,
  updateChatThreadByWorkflowRunId: state.updateChatThreadByWorkflowRunId,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/core/log", () => ({
  log: state.log,
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
  state.appendChatMessages.mockResolvedValue(undefined);
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

  it("rejects when the chat session project is not owned by the user", async () => {
    const POST = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello", messageId: "msg_1" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    });
    expect(state.resume).not.toHaveBeenCalled();
    expect(state.updateChatThreadByWorkflowRunId).not.toHaveBeenCalled();
  });

  it("returns not found when the chat session is missing", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat/run_1", {
        body: JSON.stringify({ message: "hello", messageId: "msg_1" }),
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
        body: JSON.stringify({ message: "hello", messageId: "msg_1" }),
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
        body: JSON.stringify({ message: "hello", messageId: "msg_1" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.appendChatMessages).toHaveBeenCalledTimes(1);
    expect(state.resume).toHaveBeenCalledWith("run_1", {
      message: "hello",
      messageId: "msg_1",
    });
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
        body: JSON.stringify({ message: "/done", messageId: "msg_1" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.resume).toHaveBeenCalledWith("run_1", {
      message: "/done",
      messageId: "msg_1",
    });
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
        body: JSON.stringify({ message: "hello", messageId: "msg_1" }),
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.resume).toHaveBeenCalledWith("run_1", {
      message: "hello",
      messageId: "msg_1",
    });
  });
});
