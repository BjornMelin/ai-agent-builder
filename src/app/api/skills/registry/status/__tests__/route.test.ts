import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assertProjectOwnsRegistryInstallRun: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: (...args: unknown[]) => state.requireAppUserApi(...args),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/lib/data/project-skill-registry-installs.server", () => ({
  assertProjectOwnsRegistryInstallRun: (...args: unknown[]) =>
    state.assertProjectOwnsRegistryInstallRun(...args),
}));

vi.mock("workflow/api", () => ({
  getRun: (...args: unknown[]) => state.getRun(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/skills/registry/status/route");
  return { GET: mod.GET };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.assertProjectOwnsRegistryInstallRun.mockResolvedValue(undefined);
  state.getRun.mockReturnValue({ status: Promise.resolve("running") });
});

describe("GET /api/skills/registry/status", () => {
  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request("http://localhost/api/skills/registry/status"),
    );
    expect(res.status).toBe(400);
  });

  it("returns forbidden when the project is not accessible", async () => {
    const { GET } = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);
    const res = await GET(
      new Request(
        "http://localhost/api/skills/registry/status?projectId=proj_1&runId=wf_1",
      ),
    );
    expect(res.status).toBe(403);
  });

  it("returns not_found when the workflow run is not mapped to the project", async () => {
    const { GET } = await loadRoute();
    const { AppError } = await import("@/lib/core/errors");
    state.assertProjectOwnsRegistryInstallRun.mockRejectedValueOnce(
      new AppError("not_found", 404, "Run not found."),
    );
    const res = await GET(
      new Request(
        "http://localhost/api/skills/registry/status?projectId=proj_1&runId=wf_1",
      ),
    );
    expect(res.status).toBe(404);
  });

  it("returns not_found when the workflow runtime cannot find the run", async () => {
    const { GET } = await loadRoute();
    state.getRun.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const res = await GET(
      new Request(
        "http://localhost/api/skills/registry/status?projectId=proj_1&runId=wf_1",
      ),
    );
    expect(res.status).toBe(404);
  });

  it("returns run status", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request(
        "http://localhost/api/skills/registry/status?projectId=proj_1&runId=wf_1",
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      runId: "wf_1",
      status: "running",
    });
    expect(state.assertProjectOwnsRegistryInstallRun).toHaveBeenCalledWith({
      projectId: "proj_1",
      workflowRunId: "wf_1",
    });
  });
});
