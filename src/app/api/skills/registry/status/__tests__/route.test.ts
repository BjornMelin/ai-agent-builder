import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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
  state.getRun.mockReturnValue({ status: Promise.resolve("running") });
});

describe("GET /api/skills/registry/status", () => {
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
  });
});
