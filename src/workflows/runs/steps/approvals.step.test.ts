import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createApprovalRequest: vi.fn(),
}));

vi.mock("@/lib/data/approvals.server", () => ({
  createApprovalRequest: (...args: unknown[]) =>
    state.createApprovalRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.createApprovalRequest.mockResolvedValue({
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date(0).toISOString(),
    id: "approval_1",
    intentSummary: "merge",
    metadata: {},
    projectId: "proj_1",
    runId: "run_1",
    scope: "repo.merge",
    stepId: null,
  });
});

describe("ensureApprovalRequest", () => {
  it("creates (or reuses) an approval request and returns a ref", async () => {
    const { ensureApprovalRequest } = await import("./approvals.step");

    await expect(
      ensureApprovalRequest({
        intentSummary: "merge",
        projectId: "proj_1",
        runId: "run_1",
        scope: "repo.merge",
      }),
    ).resolves.toEqual({ approvalId: "approval_1", scope: "repo.merge" });

    expect(state.createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        runId: "run_1",
        scope: "repo.merge",
      }),
    );
  });
});
