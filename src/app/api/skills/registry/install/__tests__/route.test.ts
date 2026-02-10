import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getProjectByIdForUser: vi.fn(),
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

  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.start.mockResolvedValue({ runId: "wf_1" });
});

describe("POST /api/skills/registry/install", () => {
  it("starts the workflow and returns 202+runId", async () => {
    const { POST } = await loadRoute();
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
  });
});
