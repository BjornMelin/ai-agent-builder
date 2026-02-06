import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cancelProjectRun: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/runs/project-run.server", () => ({
  cancelProjectRun: state.cancelProjectRun,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/runs/[runId]/cancel/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.cancelProjectRun.mockResolvedValue(undefined);
});

describe("POST /api/runs/:runId/cancel", () => {
  it("requires authentication before canceling", async () => {
    const POST = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/runs/run_1/cancel", { method: "POST" }),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.cancelProjectRun).not.toHaveBeenCalled();
  });

  it("returns not found when cancellation reports a missing run", async () => {
    const POST = await loadRoute();
    const { AppError } = await import("@/lib/core/errors");
    state.cancelProjectRun.mockRejectedValueOnce(
      new AppError("not_found", 404, "Run not found."),
    );

    const res = await POST(
      new Request("http://localhost/api/runs/run_1/cancel", { method: "POST" }),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBe(404);
    expect(state.cancelProjectRun).toHaveBeenCalledWith("run_1", "user");
  });

  it("cancels a run when accessible", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/runs/run_1/cancel", { method: "POST" }),
      {
        params: Promise.resolve({ runId: "run_1" }),
      },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(state.cancelProjectRun).toHaveBeenCalledWith("run_1", "user");
  });
});
