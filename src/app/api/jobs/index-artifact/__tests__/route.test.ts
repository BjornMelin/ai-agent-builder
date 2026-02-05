import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  indexArtifactVersion: vi.fn(),
  verifyQstashSignatureAppRouter: vi.fn(
    (handler: (req: Request) => Promise<Response> | Response) => handler,
  ),
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  verifyQstashSignatureAppRouter: state.verifyQstashSignatureAppRouter,
}));

vi.mock("@/lib/artifacts/index-artifact.server", () => ({
  indexArtifactVersion: state.indexArtifactVersion,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/jobs/index-artifact/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.verifyQstashSignatureAppRouter.mockImplementation(
    (handler: (req: Request) => Promise<Response> | Response) => handler,
  );
  state.indexArtifactVersion.mockResolvedValue(undefined);
});

describe("POST /api/jobs/index-artifact", () => {
  it("wraps the route with QStash signature verification", async () => {
    await loadRoute();

    expect(state.verifyQstashSignatureAppRouter).toHaveBeenCalledTimes(1);
    expect(state.verifyQstashSignatureAppRouter).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it("rejects invalid JSON bodies", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/jobs/index-artifact", {
        body: "{",
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects invalid payloads", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/jobs/index-artifact", {
        body: JSON.stringify({ projectId: "p" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    expect(state.indexArtifactVersion).not.toHaveBeenCalled();
  });

  it("calls indexArtifactVersion on success", async () => {
    const POST = await loadRoute();

    const payload = {
      artifactId: "art_1",
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
      version: 1,
    };

    const res = await POST(
      new Request("http://localhost/api/jobs/index-artifact", {
        body: JSON.stringify(payload),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    expect(state.indexArtifactVersion).toHaveBeenCalledTimes(1);
    expect(state.indexArtifactVersion).toHaveBeenCalledWith(payload);
  });
});
