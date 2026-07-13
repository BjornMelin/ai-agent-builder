import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stopOwnedSandboxById: vi.fn(),
}));

vi.mock("@/lib/sandbox/sandbox-cancellation.server", () => ({
  stopOwnedSandboxById: state.stopOwnedSandboxById,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.stopOwnedSandboxById.mockResolvedValue(undefined);
});

describe("stopImplementationSandbox", () => {
  it("durably confirms the run-owned sandbox stopped", async () => {
    const { stopImplementationSandbox } = await import("./stop-sandbox.step");

    await expect(stopImplementationSandbox("sb_1")).resolves.toBeUndefined();
    expect(state.stopOwnedSandboxById).toHaveBeenCalledWith("sb_1");
  });

  it("rejects when durable stop confirmation fails", async () => {
    const stopError = new Error("stop unconfirmed");
    state.stopOwnedSandboxById.mockRejectedValueOnce(stopError);
    const { stopImplementationSandbox } = await import("./stop-sandbox.step");

    await expect(stopImplementationSandbox("sb_1")).rejects.toBe(stopError);
  });
});
