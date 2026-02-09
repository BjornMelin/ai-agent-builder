import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAppUserApi: vi.fn(),
  startProjectCodeMode: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/runs/code-mode.server", () => ({
  startProjectCodeMode: state.startProjectCodeMode,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/code-mode/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.startProjectCodeMode.mockResolvedValue({
    id: "run_1",
    workflowRunId: "wf_1",
  });
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
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("x-workflow-run-id")).toBe("wf_1");
    await expect(res.json()).resolves.toMatchObject({
      runId: "run_1",
      workflowRunId: "wf_1",
    });
  });
});
