import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  buildChatToolsForMode: vi.fn(),
  claimChatWorkflow: vi.fn(),
  ensureChatStartIntent: vi.fn(),
  getChatStartState: vi.fn(),
  getEnabledAgentMode: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
  requestAgentModeIdSchema: { parse: vi.fn() },
  requireAppUserApi: vi.fn(),
  safeValidateUIMessages: vi.fn(),
  start: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    safeValidateUIMessages: state.safeValidateUIMessages,
  };
});

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
  start: state.start,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/ai/agents/registry.server", () => ({
  getEnabledAgentMode: state.getEnabledAgentMode,
  requestAgentModeIdSchema: state.requestAgentModeIdSchema,
}));

vi.mock("@/lib/ai/tools/factory.server", () => ({
  buildChatToolsForMode: state.buildChatToolsForMode,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/data/chat-start.server", () => ({
  claimChatWorkflow: state.claimChatWorkflow,
  ensureChatStartIntent: state.ensureChatStartIntent,
  getChatStartState: state.getChatStartState,
}));

vi.mock("@/workflows/chat/project-chat.workflow", () => ({
  projectChat: "projectChatWorkflow",
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/route");
  return mod.POST;
}

const threadId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.safeValidateUIMessages.mockResolvedValue({ data: [], success: true });
  state.requestAgentModeIdSchema.parse.mockImplementation((value: unknown) =>
    typeof value === "string" && value.length > 0 ? value : "chat-assistant",
  );
  state.getEnabledAgentMode.mockReturnValue({
    allowedTools: [],
    budgets: { maxStepsPerTurn: 1 },
    defaultModel: "ai-gateway-default",
    description: "Test mode",
    displayName: "Test mode",
    modeId: "chat-assistant",
    requirements: { context7: false, webResearch: false },
    systemPrompt: "Test.",
  });
  state.buildChatToolsForMode.mockReturnValue({});
  state.claimChatWorkflow.mockResolvedValue(true);
  state.ensureChatStartIntent.mockResolvedValue({
    id: threadId,
    projectId: "proj_1",
    status: "pending",
    workflowRunId: null,
  });
  state.getChatStartState.mockResolvedValue({
    id: threadId,
    projectId: "proj_1",
    status: "running",
    workflowRunId: "run_123",
  });
  const cancel = vi.fn().mockResolvedValue(undefined);
  state.start.mockResolvedValue({
    cancel,
    readable: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    runId: "run_123",
  });
  state.getRun.mockReturnValue({
    readable: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    runId: "run_123",
  });
});

describe("POST /api/chat", () => {
  it("requires authentication before returning a workflow run id", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers.get("x-workflow-run-id")).toBeNull();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("returns not found when the project does not exist", async () => {
    const POST = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "missing", threadId }),
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

  it("rejects the removed multi-message start shape", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ messages: [], projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    expect(state.safeValidateUIMessages).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("rejects an initial message that is not a user message", async () => {
    const POST = await loadRoute();
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [
        { id: "m1", parts: [{ text: "hi", type: "text" }], role: "assistant" },
      ],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    expect(state.start).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical validator result instead of admitting history", async () => {
    const POST = await loadRoute();
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [
        {
          id: "s1",
          parts: [{ text: "override", type: "text" }],
          role: "system",
        },
        { id: "u1", parts: [{ text: "hi", type: "text" }], role: "user" },
      ],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    expect(state.start).not.toHaveBeenCalled();
  });

  it.each([
    [
      "data-only parts",
      {
        id: "u-data",
        parts: [{ data: { key: "value" }, type: "data-context" }],
        role: "user",
      },
    ],
    [
      "reasoning-only parts",
      {
        id: "u-reasoning",
        parts: [{ text: "hidden", type: "reasoning" }],
        role: "user",
      },
    ],
    [
      "tool-only parts",
      {
        id: "u-tool",
        parts: [
          {
            input: {},
            state: "input-available",
            toolCallId: "call_1",
            type: "tool-retrieveProjectChunks",
          },
        ],
        role: "user",
      },
    ],
    [
      "empty text",
      {
        id: "u-empty",
        parts: [{ text: " \n ", type: "text" }],
        role: "user",
      },
    ],
    [
      "an overlong ID",
      {
        id: "user".repeat(33),
        parts: [{ text: "hello", type: "text" }],
        role: "user",
      },
    ],
    [
      "the assistant ID namespace",
      {
        id: "assistant:spoofed",
        parts: [{ text: "hello", type: "text" }],
        role: "user",
      },
    ],
    [
      "the start-receipt ID",
      {
        id: "chat-start-intent:v1",
        parts: [{ text: "hello", type: "text" }],
        role: "user",
      },
    ],
  ])("rejects a user message containing %s", async (_label, message) => {
    const POST = await loadRoute();
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [message],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    expect(state.ensureChatStartIntent).not.toHaveBeenCalled();
    expect(state.start).not.toHaveBeenCalled();
  });

  it("accepts a file-only initial user message", async () => {
    const POST = await loadRoute();
    const message = {
      id: "u-file",
      parts: [
        {
          filename: "requirements.md",
          mediaType: "text/markdown",
          type: "file",
          url: "https://example.com/requirements.md",
        },
      ],
      role: "user",
    };
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [message],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(state.ensureChatStartIntent).toHaveBeenCalledWith(
      expect.objectContaining({ message }),
    );
    expect(state.start).toHaveBeenCalledWith("projectChatWorkflow", [
      "proj_1",
      message,
      "chat-assistant",
      threadId,
    ]);
  });

  it("starts from one user message with optional files and returns the route-owned thread id", async () => {
    const POST = await loadRoute();
    const message = {
      id: "u1",
      parts: [
        {
          filename: "requirements.md",
          mediaType: "text/markdown",
          type: "file",
          url: "https://example.com/requirements.md",
        },
        { text: "follow up", type: "text" },
      ],
      role: "user",
    };
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [message],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-workflow-run-id")).toBe("run_123");
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    await expect(res.text()).resolves.toContain("data: [DONE]");

    expect(state.start).toHaveBeenCalledTimes(1);
    expect(state.safeValidateUIMessages).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [message] }),
    );
    expect(res.headers.get("x-chat-thread-id")).toBe(threadId);
    expect(state.start).toHaveBeenCalledWith("projectChatWorkflow", [
      "proj_1",
      message,
      "chat-assistant",
      threadId,
    ]);
    expect(state.ensureChatStartIntent).toHaveBeenCalledWith({
      message,
      mode: "chat-assistant",
      projectId: "proj_1",
      threadId,
      title: "follow up",
      userId: "user",
    });
    expect(state.claimChatWorkflow).toHaveBeenCalledWith(threadId, "run_123");
  });

  it("returns an error when the workflow cannot start", async () => {
    const POST = await loadRoute();
    state.start.mockRejectedValueOnce(new Error("start failed"));
    state.getChatStartState.mockResolvedValueOnce({
      id: threadId,
      projectId: "proj_1",
      status: "pending",
      workflowRunId: null,
    });
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [{ id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" }],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(state.start).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-chat-thread-id")).toBeNull();
  });

  it("recovers an ambiguously started workflow through its durable thread identity", async () => {
    const POST = await loadRoute();
    state.start.mockRejectedValueOnce(new Error("response lost"));
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [{ id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" }],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-workflow-run-id")).toBe("run_123");
    expect(res.headers.get("x-chat-thread-id")).toBe(threadId);
  });

  it("reuses an already registered thread without dispatching a second workflow", async () => {
    const POST = await loadRoute();
    state.ensureChatStartIntent.mockResolvedValueOnce({
      id: threadId,
      projectId: "proj_1",
      status: "running",
      workflowRunId: "run_existing",
    });
    state.getRun.mockReturnValueOnce({
      readable: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      runId: "run_existing",
    });
    state.safeValidateUIMessages.mockResolvedValueOnce({
      data: [{ id: "m1", parts: [{ text: "hi", type: "text" }], role: "user" }],
      success: true,
    });

    const res = await POST(
      new Request("http://localhost/api/chat", {
        body: JSON.stringify({ message: {}, projectId: "proj_1", threadId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-workflow-run-id")).toBe("run_existing");
    expect(state.start).not.toHaveBeenCalled();
  });
});
