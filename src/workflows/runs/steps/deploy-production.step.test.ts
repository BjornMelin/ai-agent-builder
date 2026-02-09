import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeploymentDto } from "@/lib/data/deployments.server";

const state = vi.hoisted(() => ({
  buildResourceNameHint: vi.fn(),
  createDeployment: vi.fn(),
  createDeploymentRecord: vi.fn(),
  createManualFallbackArtifact: vi.fn(),
  ensureProject: vi.fn(),
  isVercelApiConfigured: vi.fn(),
  pollDeployment: vi.fn(),
  updateDeploymentRecord: vi.fn(),
}));

vi.mock("@/lib/providers/manual-fallback.server", () => ({
  buildResourceNameHint: (...args: unknown[]) =>
    state.buildResourceNameHint(...args),
  createManualFallbackArtifact: (...args: unknown[]) =>
    state.createManualFallbackArtifact(...args),
}));

vi.mock("@/lib/providers/vercel.server", () => ({
  createDeployment: (...args: unknown[]) => state.createDeployment(...args),
  ensureProject: (...args: unknown[]) => state.ensureProject(...args),
  isVercelApiConfigured: (...args: unknown[]) =>
    state.isVercelApiConfigured(...args),
  pollDeployment: (...args: unknown[]) => state.pollDeployment(...args),
}));

vi.mock("@/lib/data/deployments.server", () => ({
  createDeploymentRecord: (...args: unknown[]) =>
    state.createDeploymentRecord(...args),
  updateDeploymentRecord: (...args: unknown[]) =>
    state.updateDeploymentRecord(...args),
}));

const baseDeployment: DeploymentDto = {
  createdAt: new Date(0).toISOString(),
  deploymentUrl: null,
  endedAt: null,
  id: "dep_1",
  metadata: {},
  projectId: "proj_1",
  provider: "vercel",
  runId: "run_1",
  startedAt: new Date(0).toISOString(),
  status: "running",
  updatedAt: new Date(0).toISOString(),
  vercelDeploymentId: null,
  vercelProjectId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.buildResourceNameHint.mockReturnValue("vercel-project-run_1");
  state.createManualFallbackArtifact.mockReturnValue({
    kind: "manual-fallback",
    provider: "vercel",
    steps: [],
    title: "manual",
  });
  state.createDeploymentRecord.mockResolvedValue(baseDeployment);
  state.updateDeploymentRecord.mockResolvedValue(baseDeployment);
  state.ensureProject.mockResolvedValue({
    created: false,
    gitHub: { owner: "o", repo: "r" },
    name: "vercel-project-run_1",
    projectId: "vproj_1",
  });
  state.createDeployment.mockResolvedValue({
    alias: [],
    createdAt: "now",
    deploymentId: "vdep_1",
    inspectorUrl: null,
    projectId: "vproj_1",
    readyState: "QUEUED",
    status: "running",
    target: "production",
    url: "example.com",
  });
  state.pollDeployment.mockResolvedValue({
    alias: [],
    errorMessage: null,
    kind: "terminal",
    pollCount: 1,
    readyState: "READY",
    readyStateReason: null,
    status: "ready",
    target: "production",
    url: "example.com",
    waitedMs: 0,
  });
});

describe("deployImplementationToProductionStep", () => {
  it("returns manual fallback when Vercel API is not configured", async () => {
    state.isVercelApiConfigured.mockReturnValueOnce(false);
    const { deployImplementationToProductionStep } = await import(
      "./deploy-production.step"
    );

    const res = await deployImplementationToProductionStep({
      projectId: "proj_1",
      projectSlug: "project",
      ref: "agent/branch",
      repoName: "r",
      repoOwner: "o",
      runId: "run_1",
    });

    expect(res.kind).toBe("manual");
    expect(state.createDeploymentRecord).toHaveBeenCalledWith(
      expect.objectContaining({ status: "manual_required" }),
    );
    expect(state.ensureProject).not.toHaveBeenCalled();
  });

  it("creates deployment, polls, and succeeds when READY", async () => {
    state.isVercelApiConfigured.mockReturnValueOnce(true);
    state.updateDeploymentRecord.mockResolvedValueOnce({
      ...baseDeployment,
      status: "succeeded",
    });

    const { deployImplementationToProductionStep } = await import(
      "./deploy-production.step"
    );

    const res = await deployImplementationToProductionStep({
      projectId: "proj_1",
      projectSlug: "project",
      ref: "agent/branch",
      repoName: "r",
      repoOwner: "o",
      runId: "run_1",
    });

    expect(res.kind).toBe("automated");
    expect(state.pollDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ deploymentId: "vdep_1" }),
    );
    expect(state.updateDeploymentRecord).toHaveBeenCalled();
  });

  it("throws when the deployment ends in a non-READY terminal state", async () => {
    state.isVercelApiConfigured.mockReturnValueOnce(true);
    state.pollDeployment.mockResolvedValueOnce({
      kind: "terminal",
      pollCount: 1,
      readyState: "ERROR",
      url: null,
      waitedMs: 0,
    });

    const { deployImplementationToProductionStep } = await import(
      "./deploy-production.step"
    );

    await expect(
      deployImplementationToProductionStep({
        projectId: "proj_1",
        projectSlug: "project",
        ref: "agent/branch",
        repoName: "r",
        repoOwner: "o",
        runId: "run_1",
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });
  });

  it("throws gateway_timeout when polling times out", async () => {
    state.isVercelApiConfigured.mockReturnValueOnce(true);
    state.pollDeployment.mockResolvedValueOnce({
      kind: "timeout",
      pollCount: 123,
      waitedMs: 10_000,
    });

    const { deployImplementationToProductionStep } = await import(
      "./deploy-production.step"
    );

    await expect(
      deployImplementationToProductionStep({
        projectId: "proj_1",
        projectSlug: "project",
        ref: "agent/branch",
        repoName: "r",
        repoOwner: "o",
        runId: "run_1",
      }),
    ).rejects.toMatchObject({ code: "gateway_timeout", status: 504 });
  });
});
