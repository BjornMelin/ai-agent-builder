import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createUIMessageStreamResponse: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getReadable: vi.fn(),
  getRun: vi.fn(),
  getRunById: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("ai", () => ({
  createUIMessageStreamResponse: state.createUIMessageStreamResponse,
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

vi.mock("@/lib/data/runs.server", () => ({
  getRunById: state.getRunById,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/runs/[runId]/stream/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.getRunById.mockResolvedValue({
    projectId: "proj_1",
    workflowRunId: "wf_1",
  });

  state.getReadable.mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  );
  state.getRun.mockReturnValue({ getReadable: state.getReadable });
  state.createUIMessageStreamResponse.mockImplementation(
    () => new Response("ok"),
  );
});

describe("GET /api/runs/:runId/stream", () => {
  it("requires authentication before allowing stream reads", async () => {
    const GET = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream"),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.getRun).not.toHaveBeenCalled();
    expect(state.createUIMessageStreamResponse).not.toHaveBeenCalled();
  });

  it("rejects invalid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream?startIndex=-1"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns not found when the run does not exist in persistence", async () => {
    const GET = await loadRoute();
    state.getRunById.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns forbidden when the run's project is not accessible", async () => {
    const GET = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(403);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns conflict when the run is not backed by Workflow DevKit", async () => {
    const GET = await loadRoute();
    state.getRunById.mockResolvedValueOnce({
      projectId: "proj_1",
      workflowRunId: null,
    });

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(409);
    expect(state.getRun).not.toHaveBeenCalled();
  });

  it("returns not found when the workflow run is missing", async () => {
    const GET = await loadRoute();
    state.getRun.mockReturnValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns a stream response for a valid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/runs/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    expect(state.getRun).toHaveBeenCalledWith("wf_1");
    expect(state.getReadable).toHaveBeenCalledWith({ startIndex: 2 });
    expect(state.createUIMessageStreamResponse).toHaveBeenCalledTimes(1);
  });
});
