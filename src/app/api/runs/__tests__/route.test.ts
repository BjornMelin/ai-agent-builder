import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAppUserApi: vi.fn(),
  startProjectRun: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/runs/project-run.server", () => ({
  startProjectRun: state.startProjectRun,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/runs/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.startProjectRun.mockResolvedValue({
    createdAt: new Date().toISOString(),
    id: "run_1",
    kind: "research",
    metadata: {},
    projectId: "proj_1",
    status: "pending",
    updatedAt: new Date().toISOString(),
    workflowRunId: "wf_1",
  });
});

describe("POST /api/runs", () => {
  it("requires authentication before starting a run", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/runs", {
        body: JSON.stringify({ kind: "research", projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.startProjectRun).not.toHaveBeenCalled();
    expect(res.headers.get("x-workflow-run-id")).toBeNull();
  });

  it("rejects invalid JSON bodies", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/runs", { body: "{", method: "POST" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects invalid payloads", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/runs", {
        body: JSON.stringify({ kind: "research", projectId: "" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("starts a workflow-backed run and returns x-workflow-run-id", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/runs", {
        body: JSON.stringify({ kind: "research", projectId: "proj_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.get("x-workflow-run-id")).toBe("wf_1");
    await expect(res.json()).resolves.toMatchObject({
      id: "run_1",
      projectId: "proj_1",
      workflowRunId: "wf_1",
    });
    expect(state.startProjectRun).toHaveBeenCalledTimes(1);
  });
});
