import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = installImplementationRunHarness();
const { state } = harness;

beforeEach(() => {
  vi.clearAllMocks();
  harness.reset();
});

describe("stopImplementationSandbox", () => {
  it("swallows sandbox lookup errors", async () => {
    state.getVercelSandbox.mockRejectedValueOnce(new Error("missing"));
    const { stopImplementationSandbox } = await import("./stop-sandbox.step");
    await expect(
      stopImplementationSandbox("sb_missing"),
    ).resolves.toBeUndefined();
  });

  it("best-effort stops the sandbox and swallows stop errors", async () => {
    state.getVercelSandbox.mockResolvedValueOnce({
      stop: vi.fn(async () => {
        throw new Error("already stopped");
      }),
    });
    const { stopImplementationSandbox } = await import("./stop-sandbox.step");
    await expect(stopImplementationSandbox("sb_1")).resolves.toBeUndefined();
  });
});
