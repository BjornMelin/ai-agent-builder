import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cancelRun: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getWorld: vi.fn(),
  recordProjectSkillRegistryInstall: vi.fn(),
  requireAppUserApi: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: (...args: unknown[]) => state.requireAppUserApi(...args),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/lib/data/project-skill-registry-installs.server", () => ({
  recordProjectSkillRegistryInstall: (...args: unknown[]) =>
    state.recordProjectSkillRegistryInstall(...args),
}));

vi.mock("@workflow/core/runtime", () => ({
  cancelRun: (...args: unknown[]) => state.cancelRun(...args),
  getWorld: (...args: unknown[]) => state.getWorld(...args),
}));

vi.mock("workflow/api", () => ({
  start: (...args: unknown[]) => state.start(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/skills/registry/install/route");
  return { POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.getWorld.mockReturnValue({ id: "world_1" });
  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.start.mockResolvedValue({ runId: "wf_1" });
  state.recordProjectSkillRegistryInstall.mockResolvedValue({
    id: "map_1",
    projectId: "proj_1",
    registryId: "vercel-labs/skills/find-skills",
    workflowRunId: "wf_1",
  });
  state.cancelRun.mockResolvedValue(undefined);
});

describe("POST /api/skills/registry/install", () => {
  it("starts the workflow and returns 202+runId", async () => {
    const { POST } = await loadRoute();
    const world = state.getWorld();
    const res = await POST(
      new Request("http://localhost/api/skills/registry/install", {
        body: JSON.stringify({
          projectId: "proj_1",
          registryId: "vercel-labs/skills/find-skills",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      runId: "wf_1",
    });
    expect(state.start).toHaveBeenCalled();
    expect(state.start).toHaveBeenCalledWith(
      expect.anything(),
      ["proj_1", "vercel-labs/skills/find-skills"],
      { world },
    );
    expect(state.recordProjectSkillRegistryInstall).toHaveBeenCalledWith({
      projectId: "proj_1",
      registryId: "vercel-labs/skills/find-skills",
      workflowRunId: "wf_1",
    });
  });

  it("cancels the run when the install mapping cannot be recorded", async () => {
    const { POST } = await loadRoute();
    const world = state.getWorld();
    state.recordProjectSkillRegistryInstall.mockRejectedValueOnce(
      new Error("db down"),
    );

    const res = await POST(
      new Request("http://localhost/api/skills/registry/install", {
        body: JSON.stringify({
          projectId: "proj_1",
          registryId: "vercel-labs/skills/find-skills",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "internal_error" },
    });
    expect(state.start).toHaveBeenCalled();
    expect(state.cancelRun).toHaveBeenCalledWith(world, "wf_1");
  });
});
