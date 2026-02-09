import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createDeploymentRecord: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  listDeploymentsByProject: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/deployments.server", () => ({
  createDeploymentRecord: state.createDeploymentRecord,
  listDeploymentsByProject: state.listDeploymentsByProject,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/deployments/route");
  return { GET: mod.GET, POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "u" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });

  state.listDeploymentsByProject.mockResolvedValue([
    {
      createdAt: new Date().toISOString(),
      deploymentUrl: "https://example.vercel.app",
      endedAt: null,
      id: "dep_1",
      metadata: {},
      projectId: "proj_1",
      provider: "vercel",
      runId: "run_1",
      startedAt: new Date().toISOString(),
      status: "running",
      updatedAt: new Date().toISOString(),
      vercelDeploymentId: "dpl_123",
      vercelProjectId: "prj_123",
    },
  ]);

  state.createDeploymentRecord.mockResolvedValue({
    createdAt: new Date().toISOString(),
    deploymentUrl: "https://example.vercel.app",
    endedAt: null,
    id: "dep_1",
    metadata: {},
    projectId: "proj_1",
    provider: "vercel",
    runId: "run_1",
    startedAt: null,
    status: "created",
    updatedAt: new Date().toISOString(),
    vercelDeploymentId: null,
    vercelProjectId: null,
  });
});

describe("GET /api/deployments", () => {
  it("requires authentication before listing deployments", async () => {
    const { GET } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/deployments?projectId=proj_1"),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.listDeploymentsByProject).not.toHaveBeenCalled();
  });

  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/deployments"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("lists deployments for a project", async () => {
    const { GET } = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/deployments?projectId=proj_1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      deployments: [{ id: "dep_1" }],
    });
    expect(state.listDeploymentsByProject).toHaveBeenCalledWith("proj_1", {});
  });
});

describe("POST /api/deployments", () => {
  it("requires authentication before creating deployments", async () => {
    const { POST } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/deployments", {
        body: JSON.stringify({ projectId: "proj_1", status: "created" }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.createDeploymentRecord).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deployments", {
        body: "{",
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("creates a deployment record", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deployments", {
        body: JSON.stringify({
          deploymentUrl: "https://example.vercel.app",
          projectId: "proj_1",
          provider: "vercel",
          runId: "run_1",
          status: "created",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(state.createDeploymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentUrl: "https://example.vercel.app",
        projectId: "proj_1",
        provider: "vercel",
        runId: "run_1",
        status: "created",
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      deployment: { id: "dep_1" },
    });
  });
});
