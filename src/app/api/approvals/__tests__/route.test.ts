import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  approvalHookToken: vi.fn(),
  approveApprovalRequest: vi.fn(),
  getApprovalById: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getRunById: vi.fn(),
  listPendingApprovals: vi.fn(),
  requireAppUserApi: vi.fn(),
  resumeApprovalHook: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/approvals.server", () => ({
  approveApprovalRequest: state.approveApprovalRequest,
  getApprovalById: state.getApprovalById,
  listPendingApprovals: state.listPendingApprovals,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/data/runs.server", () => ({
  getRunById: state.getRunById,
}));

vi.mock("@/workflows/approvals/hooks/approval", () => ({
  approvalHookToken: state.approvalHookToken,
  resumeApprovalHook: state.resumeApprovalHook,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/approvals/route");
  return { GET: mod.GET, POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({
    email: "a@example.com",
    id: "u",
  });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.listPendingApprovals.mockResolvedValue([
    {
      approvedAt: null,
      approvedBy: null,
      createdAt: new Date().toISOString(),
      id: "approval_1",
      intentSummary: "merge",
      metadata: {},
      projectId: "proj_1",
      runId: "run_1",
      scope: "repo.merge",
      stepId: null,
    },
  ]);

  state.getApprovalById.mockResolvedValue({
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date().toISOString(),
    id: "approval_1",
    intentSummary: "merge",
    metadata: {},
    projectId: "proj_1",
    runId: "run_1",
    scope: "repo.merge",
    stepId: null,
  });

  state.approveApprovalRequest.mockResolvedValue({
    approvedAt: new Date().toISOString(),
    approvedBy: "a@example.com",
    createdAt: new Date().toISOString(),
    id: "approval_1",
    intentSummary: "merge",
    metadata: {},
    projectId: "proj_1",
    runId: "run_1",
    scope: "repo.merge",
    stepId: null,
  });

  state.getRunById.mockResolvedValue({
    createdAt: new Date().toISOString(),
    id: "run_1",
    kind: "implementation",
    metadata: {},
    projectId: "proj_1",
    status: "blocked",
    updatedAt: new Date().toISOString(),
    workflowRunId: "wf_1",
  });

  state.approvalHookToken.mockReturnValue("approval_1");
  state.resumeApprovalHook.mockResolvedValue(undefined);
});

describe("GET /api/approvals", () => {
  it("requires authentication before listing approvals", async () => {
    const { GET } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/approvals?projectId=proj_1"),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.listPendingApprovals).not.toHaveBeenCalled();
  });

  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/approvals"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("lists pending approvals for a project", async () => {
    const { GET } = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/approvals?projectId=proj_1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      approvals: [{ id: "approval_1", scope: "repo.merge" }],
    });
    expect(state.listPendingApprovals).toHaveBeenCalledWith("proj_1", {});
  });
});

describe("POST /api/approvals", () => {
  it("requires authentication before approving", async () => {
    const { POST } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/approvals", {
        body: JSON.stringify({ approvalId: "approval_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.approveApprovalRequest).not.toHaveBeenCalled();
  });

  it("returns not found when the approval does not exist", async () => {
    const { POST } = await loadRoute();
    state.getApprovalById.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/approvals", {
        body: JSON.stringify({ approvalId: "missing" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
  });

  it("approves and resumes the workflow when workflowRunId exists", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/approvals", {
        body: JSON.stringify({ approvalId: "approval_1" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      approval: { approvedBy: "a@example.com", id: "approval_1" },
    });
    expect(state.approveApprovalRequest).toHaveBeenCalledWith({
      approvalId: "approval_1",
      approvedBy: "a@example.com",
    });
    expect(state.approvalHookToken).toHaveBeenCalledWith("approval_1");
    expect(state.resumeApprovalHook).toHaveBeenCalledWith(
      "approval_1",
      expect.objectContaining({
        approvalId: "approval_1",
        approvedBy: "a@example.com",
        scope: "repo.merge",
      }),
    );
  });
});
