import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createDeployment: vi.fn(),
  ensureProject: vi.fn(),
  pollDeployment: vi.fn(),
  upsertEnvVars: vi.fn(),
}));

vi.mock("@/lib/providers/vercel.server", () => ({
  createDeployment: (...args: unknown[]) => state.createDeployment(...args),
  ensureProject: (...args: unknown[]) => state.ensureProject(...args),
  pollDeployment: (...args: unknown[]) => state.pollDeployment(...args),
  upsertEnvVars: (...args: unknown[]) => state.upsertEnvVars(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.ensureProject.mockResolvedValue({
    created: false,
    gitHub: null,
    name: "proj",
    projectId: "vproj_1",
  });
  state.upsertEnvVars.mockResolvedValue({ created: 0, updated: 0 });
  state.createDeployment.mockResolvedValue({
    alias: [],
    createdAt: "now",
    deploymentId: "vdep_1",
    inspectorUrl: null,
    projectId: "vproj_1",
    readyState: "QUEUED",
    status: "running",
    target: "preview",
    url: "https://example.com",
  });
  state.pollDeployment.mockResolvedValue({
    kind: "terminal",
    pollCount: 1,
    readyState: "READY",
    url: "https://example.com",
    waitedMs: 0,
  });
});

describe("deploy step wrappers", () => {
  it("ensureVercelProject forwards arguments", async () => {
    const { ensureVercelProject } = await import("./deploy.step");
    await ensureVercelProject({
      gitHubRepo: { owner: "o", repo: "r" },
      vercelProjectName: "name",
    });
    expect(state.ensureProject).toHaveBeenCalledWith(
      expect.objectContaining({
        gitHubRepo: { owner: "o", repo: "r" },
        name: "name",
      }),
    );
  });

  it("upsertVercelEnvVars forwards arguments", async () => {
    const { upsertVercelEnvVars } = await import("./deploy.step");
    await upsertVercelEnvVars({
      envVars: [
        {
          key: "A",
          targets: ["production"],
          type: "encrypted",
          value: "secret",
        },
      ],
      vercelProjectId: "vproj_1",
    });
    expect(state.upsertEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "vproj_1" }),
    );
  });

  it("createVercelDeployment forwards arguments", async () => {
    const { createVercelDeployment } = await import("./deploy.step");
    await createVercelDeployment({
      deploymentName: "dep",
      gitHub: { owner: "o", ref: "main", repo: "r" },
      vercelProjectId: "vproj_1",
    });
    expect(state.createDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ name: "dep", projectId: "vproj_1" }),
    );
  });

  it("pollVercelDeployment forwards arguments", async () => {
    const { pollVercelDeployment } = await import("./deploy.step");
    await pollVercelDeployment({
      intervalMs: 123,
      timeoutMs: 456,
      vercelDeploymentId: "vdep_1",
    });
    expect(state.pollDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "vdep_1",
        intervalMs: 123,
        timeoutMs: 456,
      }),
    );
  });
});
