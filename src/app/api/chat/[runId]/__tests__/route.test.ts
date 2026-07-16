import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  inspectChatFollowUp: vi.fn(),
  requireAppUserApi: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/chat-follow-up.server", () => ({
  inspectChatFollowUp: state.inspectChatFollowUp,
}));

vi.mock("@/lib/data/chat.server", () => ({
  getChatThreadByWorkflowRunId: state.getChatThreadByWorkflowRunId,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getActiveProjectByIdForUser: state.getProjectByIdForUser,
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

async function loadStatusRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/route");
  return mod.GET;
}

function request(body: unknown) {
  return new Request("http://localhost/api/chat/run_1", {
    body: JSON.stringify(body),
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.resume.mockResolvedValue({ runId: "run_1" });
  state.inspectChatFollowUp.mockResolvedValue("available");
  state.getChatThreadByWorkflowRunId.mockResolvedValue({
    id: "thread_1",
    projectId: "proj_1",
    status: "waiting",
    updatedAt: "2026-07-13T00:00:00.000Z",
  });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
});

describe("GET /api/chat/:runId", () => {
  it("returns authenticated authoritative lifecycle state", async () => {
    const GET = await loadStatusRoute();

    const res = await GET(new Request("http://localhost/api/chat/run_1"), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "waiting",
      threadId: "thread_1",
      workflowRunId: "run_1",
    });
  });

  it("authorizes before disclosing terminal lifecycle state", async () => {
    const GET = await loadStatusRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      id: "thread_1",
      projectId: "proj_1",
      status: "canceled",
    });

    const res = await GET(new Request("http://localhost/api/chat/run_1"), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/chat/:runId", () => {
  it("authorizes before delivering to the durable hook", async () => {
    const POST = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(403);
    expect(state.inspectChatFollowUp).not.toHaveBeenCalled();
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("returns not found when the persisted chat session is missing", async () => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(404);
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("delivers a validated payload and waiting-generation fence to the durable hook", async () => {
    const POST = await loadRoute();
    const files = [
      {
        filename: "report.pdf",
        mediaType: "application/pdf",
        type: "file",
        url: "https://1.public.blob.vercel-storage.com/projects/proj_1/uploads/report.pdf",
      },
    ] as const;

    const res = await POST(
      request({ files, message: "hello", messageId: "msg_1" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      status: "queued",
    });
    expect(state.inspectChatFollowUp).toHaveBeenCalledWith({
      messageId: "msg_1",
      payload: { files, message: "hello" },
      threadId: "thread_1",
    });
    expect(state.resume).toHaveBeenCalledWith("run_1", {
      files,
      message: "hello",
      messageId: "msg_1",
      schemaVersion: 2,
      waitingSince: "2026-07-13T00:00:00.000Z",
    });
  });

  it("returns an exact persisted retry without adding another hook delivery", async () => {
    const POST = await loadRoute();
    state.inspectChatFollowUp.mockResolvedValueOnce("duplicate");

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      status: "duplicate",
    });
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("returns a machine-readable conflict for mismatched message ID reuse", async () => {
    const POST = await loadRoute();
    state.inspectChatFollowUp.mockResolvedValueOnce("payload_mismatch");

    const res = await POST(
      request({ message: "changed", messageId: "msg_1" }),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "chat_message_id_conflict" },
    });
    expect(state.resume).not.toHaveBeenCalled();
  });

  it.each([
    ["running", "chat_session_busy"],
    ["succeeded", "chat_session_terminal"],
    ["failed", "chat_session_terminal"],
    ["canceled", "chat_session_terminal"],
  ])("returns %s as a machine-readable lifecycle conflict", async (status, code) => {
    const POST = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce({
      id: "thread_1",
      projectId: "proj_1",
      status,
      updatedAt: "2026-07-13T00:00:00.000Z",
    });

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code } });
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("rejects the reserved assistant message namespace", async () => {
    const POST = await loadRoute();

    const res = await POST(
      request({ message: "collision", messageId: "assistant:run_1:2" }),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    expect(state.inspectChatFollowUp).not.toHaveBeenCalled();
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("never performs destructive rollback when hook delivery has an ambiguous error", async () => {
    const POST = await loadRoute();
    state.resume.mockRejectedValueOnce(
      new Error("queue failed after event write"),
    );

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(500);
    expect(state.resume).toHaveBeenCalledTimes(1);
    expect(state.inspectChatFollowUp).toHaveBeenCalledTimes(1);
  });

  it("does not acknowledge a delivery when the reusable hook is unavailable", async () => {
    const POST = await loadRoute();
    state.resume.mockResolvedValueOnce(null);

    const res = await POST(request({ message: "hello", messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "chat_hook_unavailable" },
    });
  });

  it.each([
    [
      {
        filename: "report.pdf",
        mediaType: "application/pdf",
        type: "file",
        url: "https://example.com/report.pdf",
      },
      "bad_request",
    ],
    [
      {
        filename: "image.png",
        mediaType: "image/png",
        type: "file",
        url: "https://1.public.blob.vercel-storage.com/projects/proj_1/uploads/image.png",
      },
      "unsupported_file_type",
    ],
  ])("rejects an invalid attachment before hook delivery", async (file, code) => {
    const POST = await loadRoute();

    const res = await POST(request({ files: [file], messageId: "msg_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: { code } });
    expect(state.resume).not.toHaveBeenCalled();
  });

  it("delivers /done without route-owned transcript writes", async () => {
    const POST = await loadRoute();

    const res = await POST(request({ message: "/done", messageId: "done_1" }), {
      params: Promise.resolve({ runId: "run_1" }),
    });

    expect(res.status).toBe(202);
    expect(state.resume).toHaveBeenCalledWith("run_1", {
      message: "/done",
      messageId: "done_1",
      schemaVersion: 2,
      waitingSince: "2026-07-13T00:00:00.000Z",
    });
  });
});
