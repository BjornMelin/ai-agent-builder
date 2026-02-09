import { simulateReadableStream } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getCodeModeRun: vi.fn(),
  getReadable: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

vi.mock("@/lib/runs/code-mode.server", () => ({
  getCodeModeRun: state.getCodeModeRun,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/code-mode/[runId]/stream/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getCodeModeRun.mockResolvedValue({
    id: "run_1",
    workflowRunId: "wf_1",
  });

  state.getReadable.mockReturnValue(simulateReadableStream({ chunks: [] }));
  state.getRun.mockReturnValue({ getReadable: state.getReadable });
});

describe("GET /api/code-mode/:runId/stream", () => {
  it("requires authentication before allowing stream reads", async () => {
    const GET = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/code-mode/run_1/stream"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("rejects invalid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/code-mode/run_1/stream?startIndex=-1"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns conflict when the run is not backed by Workflow DevKit", async () => {
    const GET = await loadRoute();
    state.getCodeModeRun.mockResolvedValueOnce({
      id: "run_1",
      workflowRunId: null,
    });

    const res = await GET(
      new Request("http://localhost/api/code-mode/run_1/stream"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(409);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBeNull();
  });

  it("returns a stream response for a valid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/code-mode/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.getReadable).toHaveBeenCalledWith({ startIndex: 2 });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");

    await expect(res.text()).resolves.toContain("data: [DONE]");
  });
});
