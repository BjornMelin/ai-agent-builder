import { simulateReadableStream } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getChatThreadByWorkflowRunId: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getReadable: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

vi.mock("@/lib/data/chat.server", () => ({
  getChatThreadByWorkflowRunId: state.getChatThreadByWorkflowRunId,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/stream/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectByIdForUser.mockResolvedValue({
    id: "proj_1",
  });
  state.getChatThreadByWorkflowRunId.mockResolvedValue({
    projectId: "proj_1",
  });

  state.getReadable.mockReturnValue(simulateReadableStream({ chunks: [] }));
  state.getRun.mockReturnValue({ getReadable: state.getReadable });
});

describe("GET /api/chat/:runId/stream", () => {
  it("requires authentication before allowing stream reads", async () => {
    const GET = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream"),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("rejects invalid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=-1"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects malformed startIndex values", async () => {
    const GET = await loadRoute();

    const alphabetic = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=abc"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );
    const decimal = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2.5"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );
    const alphabeticPayload = await alphabetic.json();
    const decimalPayload = await decimal.json();

    expect(alphabetic.status).toBe(400);
    expect(decimal.status).toBe(400);
    expect(alphabeticPayload).toMatchObject({
      error: { code: "bad_request", message: "Invalid startIndex." },
    });
    expect(decimalPayload).toMatchObject({
      error: { code: "bad_request", message: "Invalid startIndex." },
    });
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns not found when the run does not exist in persistence", async () => {
    const GET = await loadRoute();
    state.getChatThreadByWorkflowRunId.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("returns not found when workflow run handle is missing", async () => {
    const GET = await loadRoute();
    state.getRun.mockReturnValueOnce(undefined);

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("returns forbidden when the run's project is not accessible", async () => {
    const GET = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(403);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("returns a stream response for a valid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    expect(state.getRun).toHaveBeenCalledWith("run_1");
    expect(state.getReadable).toHaveBeenCalledWith({ startIndex: 2 });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");

    await expect(res.text()).resolves.toContain("data: [DONE]");
  });
});
