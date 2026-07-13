import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getActiveProjectCodeModeRun: vi.fn(),
  getCodeModeRun: vi.fn(),
  requireAppUserApi: vi.fn(),
  startProjectCodeMode: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/runs/code-mode.server", () => ({
  getActiveProjectCodeModeRun: state.getActiveProjectCodeModeRun,
  getCodeModeRun: state.getCodeModeRun,
  startProjectCodeMode: state.startProjectCodeMode,
}));

const runId = "00000000-0000-4000-8000-000000000001";
const run = {
  id: runId,
  metadata: {
    networkAccess: "none",
    origin: "code-mode",
    prompt: "List repo files and summarize.",
  },
  projectId: "proj_1",
  status: "pending",
  workflowRunId: "wf_1",
};

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/code-mode/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.startProjectCodeMode.mockResolvedValue(run);
  state.getCodeModeRun.mockResolvedValue(run);
  state.getActiveProjectCodeModeRun.mockResolvedValue(run);
});

describe("POST /api/code-mode", () => {
  it("requires authentication before starting", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/code-mode", {
        body: JSON.stringify({ projectId: "proj_1", prompt: "hello" }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.startProjectCodeMode).not.toHaveBeenCalled();
  });

  it("rejects invalid inputs", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/code-mode", {
        body: JSON.stringify({ projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns runId + workflowRunId with header", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/code-mode", {
        body: JSON.stringify({
          projectId: "proj_1",
          prompt: "List repo files and summarize.",
          runId,
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("x-workflow-run-id")).toBe("wf_1");
    await expect(res.json()).resolves.toMatchObject({
      runId,
      status: "pending",
      workflowRunId: "wf_1",
    });
    expect(state.startProjectCodeMode).toHaveBeenCalledWith(
      expect.objectContaining({ runId }),
    );
  });

  it("discovers a known authenticated run by client-known ID", async () => {
    vi.resetModules();
    const { GET } = await import("@/app/api/code-mode/route");

    const res = await GET(
      new Request(
        `http://localhost/api/code-mode?projectId=proj_1&runId=${runId}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(state.getCodeModeRun).toHaveBeenCalledWith(runId, "user");
    await expect(res.json()).resolves.toMatchObject({
      run: { runId, workflowRunId: "wf_1" },
    });
  });
});
