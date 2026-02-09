import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    vercelWebhooks: { secret: "secret_test" },
  },
  getDeploymentById: vi.fn(),
  getDeploymentByVercelDeploymentIdAnyProject: vi.fn(),
  updateDeploymentRecord: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/data/deployments.server", () => ({
  getDeploymentById: state.getDeploymentById,
  getDeploymentByVercelDeploymentIdAnyProject:
    state.getDeploymentByVercelDeploymentIdAnyProject,
  updateDeploymentRecord: state.updateDeploymentRecord,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/webhooks/vercel/route");
  return { POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.getDeploymentByVercelDeploymentIdAnyProject.mockResolvedValue({
    createdAt: new Date().toISOString(),
    deploymentUrl: null,
    endedAt: null,
    id: "dep_1",
    metadata: {},
    projectId: "proj_1",
    provider: "vercel",
    runId: null,
    startedAt: null,
    status: "running",
    updatedAt: new Date().toISOString(),
    vercelDeploymentId: "dpl_123",
    vercelProjectId: "prj_123",
  });

  state.getDeploymentById.mockResolvedValue({
    createdAt: new Date().toISOString(),
    deploymentUrl: null,
    endedAt: null,
    id: "dep_1",
    metadata: { hello: "world" },
    projectId: "proj_1",
    provider: "vercel",
    runId: null,
    startedAt: null,
    status: "running",
    updatedAt: new Date().toISOString(),
    vercelDeploymentId: "dpl_123",
    vercelProjectId: "prj_123",
  });
});

describe("POST /api/webhooks/vercel", () => {
  it("rejects missing signature", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/webhooks/vercel", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid signature", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/webhooks/vercel", {
        body: JSON.stringify({ deployment: { id: "dpl_123" } }),
        headers: { "x-vercel-signature": "nope" },
        method: "POST",
      }),
    );

    expect(res.status).toBe(401);
  });

  it("accepts valid signature and updates matching deployment", async () => {
    const { POST } = await loadRoute();

    const body = JSON.stringify({
      deployment: { id: "dpl_123", state: "READY", url: "example.vercel.app" },
      type: "deployment.ready",
    });
    const signature = createHmac("sha1", "secret_test")
      .update(Buffer.from(body, "utf8"))
      .digest("hex");

    const res = await POST(
      new Request("http://localhost/api/webhooks/vercel", {
        body,
        headers: { "x-vercel-signature": signature },
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(state.updateDeploymentRecord).toHaveBeenCalledWith(
      "dep_1",
      expect.objectContaining({
        deploymentUrl: "https://example.vercel.app",
        metadata: expect.objectContaining({
          hello: "world",
          vercelWebhook: expect.objectContaining({
            deploymentId: "dpl_123",
            status: "READY",
            url: "https://example.vercel.app",
          }),
        }),
        status: "READY",
      }),
    );
  });
});
