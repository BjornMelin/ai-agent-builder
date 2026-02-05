import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createUIMessageStreamResponse: vi.fn(),
  ensureChatThreadForWorkflowRun: vi.fn(),
  getProjectById: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
  safeValidateUIMessages: vi.fn(),
  start: vi.fn(),
}));

vi.mock("ai", () => ({
  createUIMessageStreamResponse: state.createUIMessageStreamResponse,
  safeValidateUIMessages: state.safeValidateUIMessages,
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
  start: state.start,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/chat.server", () => ({
  ensureChatThreadForWorkflowRun: state.ensureChatThreadForWorkflowRun,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectById: state.getProjectById,
}));

vi.mock("@/workflows/chat/project-chat.workflow", () => ({
  projectChat: "projectChatWorkflow",
}));

vi.mock("@/workflows/chat/tools", () => ({
  chatTools: {},
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectById.mockResolvedValue({ id: "proj_1" });
  state.safeValidateUIMessages.mockResolvedValue({ data: [], success: true });
  state.start.mockResolvedValue({
    readable: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    runId: "run_123",
  });
  state.getRun.mockReturnValue({ cancel: vi.fn() });
  state.ensureChatThreadForWorkflowRun.mockResolvedValue({
    createdAt: new Date().toISOString(),
    endedAt: null,
    id: "thread_1",
    lastActivityAt: new Date().toISOString(),
    projectId: "proj_1",
    status: "running",
    title: "New chat",
    updatedAt: new Date().toISOString(),
    workflowRunId: "run_123",
  });
  state.createUIMessageStreamResponse.mockImplementation(
    ({ headers }: { headers?: Record<string, string> }) =>
      new Response("ok", headers === undefined ? undefined : { headers }),
  );
});

describe("POST /api/chat", () => {
  it("requires authentication before returning a workflow run id", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ messages: [], projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get("x-workflow-run-id")).toBeNull();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("returns not found when the project does not exist", async () => {
    const POST = await loadRoute();
    state.getProjectById.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ messages: [], projectId: "missing" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(404);
    expect(state.start).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat", { body: "{", method: "POST" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects invalid payloads", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ projectId: "" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects when validated messages are missing or last message is not user", async () => {
    const POST = await loadRoute();

    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [
        { id: "m1", parts: [{ text: "hi", type: "text" }], role: "assistant" },
      ],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ messages: [], projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("starts a workflow run and returns a stream with x-workflow-run-id", async () => {
    const POST = await loadRoute();

    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [{ id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" }],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ messages: [], projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-workflow-run-id")).toBe("run_123");
    expect(state.start).toHaveBeenCalledTimes(1);
  });
});
