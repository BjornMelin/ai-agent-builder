import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAppUserApi: vi.fn(),
  retrieveProjectArtifacts: vi.fn(),
  retrieveProjectChunks: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/ai/tools/retrieval.server", () => ({
  retrieveProjectArtifacts: state.retrieveProjectArtifacts,
  retrieveProjectChunks: state.retrieveProjectChunks,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/search/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.retrieveProjectChunks.mockResolvedValue([]);
  state.retrieveProjectArtifacts.mockResolvedValue([]);
});

describe("GET /api/search (project scoped)", () => {
  it("requires q", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/search?projectId=p"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("merges chunk + artifact results and sorts by score", async () => {
    const GET = await loadRoute();

    state.retrieveProjectChunks.mockResolvedValueOnce([
      {
        id: "c1",
        provenance: {
          chunkIndex: 1,
          fileId: "f1",
          pageEnd: undefined,
          pageStart: undefined,
          projectId: "p1",
          type: "chunk",
        },
        score: 0.3,
        snippet: "chunk",
      },
    ]);

    state.retrieveProjectArtifacts.mockResolvedValueOnce([
      {
        id: "a1",
        provenance: {
          artifactId: "art_1",
          kind: "PRD",
          logicalKey: "PRD",
          projectId: "p1",
          type: "artifact",
          version: 1,
        },
        score: 0.9,
        snippet: "artifact",
        title: "PRD",
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/search?q=test&projectId=p1"),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as { results: unknown[] };
    expect(payload.results.length).toBe(2);
    expect(payload.results[0]).toMatchObject({ id: "a1", type: "artifact" });
    expect(payload.results[1]).toMatchObject({ id: "c1", type: "chunk" });
  });
});
