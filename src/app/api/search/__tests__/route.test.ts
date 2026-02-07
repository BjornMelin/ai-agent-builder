import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  limitSearchRequest: vi.fn(),
  projectFilesFindMany: vi.fn(),
  projectsFindMany: vi.fn(),
  requireAppUserApi: vi.fn(),
  retrieveProjectArtifacts: vi.fn(),
  retrieveProjectChunks: vi.fn(),
  runsFindMany: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    execute: state.dbExecute,
    query: {
      projectFilesTable: {
        findMany: state.projectFilesFindMany,
      },
      projectsTable: {
        findMany: state.projectsFindMany,
      },
      runsTable: {
        findMany: state.runsFindMany,
      },
    },
  }),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/upstash/ratelimit.server", () => ({
  limitSearchRequest: state.limitSearchRequest,
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
  state.getProjectByIdForUser.mockResolvedValue({
    id: "p1",
  });
  state.limitSearchRequest.mockResolvedValue({
    limit: 60,
    remaining: 59,
    reset: Date.now() + 60_000,
    retryAfterSeconds: null,
    success: true,
  });
  state.projectsFindMany.mockResolvedValue([]);
  state.projectFilesFindMany.mockResolvedValue([]);
  state.runsFindMany.mockResolvedValue([]);
  state.dbExecute.mockResolvedValue({ rows: [] });
});

describe("GET /api/search", () => {
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

  it("rejects too-short queries", async () => {
    const GET = await loadRoute();

    const res = await GET(new Request("http://localhost/api/search?q=a"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects project scope without projectId", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/search?q=test&scope=project"),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects unknown scopes and types", async () => {
    const GET = await loadRoute();

    const badScope = await GET(
      new Request("http://localhost/api/search?q=test&scope=workspace"),
    );
    expect(badScope.status).toBe(400);

    const badTypes = await GET(
      new Request("http://localhost/api/search?q=test&types=projects,unknown"),
    );
    expect(badTypes.status).toBe(400);
  });

  it("merges project-scoped upload/chunk/artifact results and sorts by score", async () => {
    const GET = await loadRoute();

    state.projectFilesFindMany.mockResolvedValueOnce([
      {
        id: "f1",
        mimeType: "text/plain",
        name: "upload.txt",
        projectId: "p1",
        sizeBytes: 1280,
      },
    ]);

    state.retrieveProjectChunks.mockResolvedValueOnce([
      {
        id: "c1",
        provenance: {
          chunkIndex: 1,
          fileId: "f1",
          pageEnd: undefined,
          pageStart: undefined,
          projectId: "p1",
        },
        score: 0.3,
        snippet: "chunk",
        type: "chunk",
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
      new Request(
        "http://localhost/api/search?q=test&projectId=p1&scope=project&types=uploads,chunks,artifacts&limit=5",
      ),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      meta: { scope: string; types: string[] };
      results: Array<{ id: string; type: string }>;
    };

    expect(payload.meta.scope).toBe("project");
    expect(payload.meta.types).toEqual(["uploads", "chunks", "artifacts"]);
    expect(payload.results).toHaveLength(3);
    expect(payload.results[0]).toMatchObject({ id: "a1", type: "artifact" });
    expect(payload.results[1]).toMatchObject({ id: "c1", type: "chunk" });
    expect(payload.results[2]).toMatchObject({ id: "f1", type: "upload" });
    expect(state.getProjectByIdForUser).toHaveBeenCalledWith("p1", "user");
  });

  it("supports global scope with types and limit", async () => {
    const GET = await loadRoute();

    state.projectsFindMany.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Alpha",
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost/api/search?q=alpha&scope=global&types=projects&limit=1",
      ),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      meta: { limit: number; scope: string; types: string[] };
      results: Array<{ id: string; type: string }>;
    };

    expect(payload.meta.scope).toBe("global");
    expect(payload.meta.limit).toBe(1);
    expect(payload.meta.types).toEqual(["projects"]);
    expect(payload.results).toEqual([
      {
        href: "/projects/p1",
        id: "p1",
        title: "Alpha",
        type: "project",
      },
    ]);
    expect(state.projectFilesFindMany).not.toHaveBeenCalled();
    expect(state.runsFindMany).not.toHaveBeenCalled();
    expect(state.retrieveProjectChunks).not.toHaveBeenCalled();
    expect(state.retrieveProjectArtifacts).not.toHaveBeenCalled();
  });

  it("returns run results when runs type is requested", async () => {
    const GET = await loadRoute();

    state.runsFindMany.mockResolvedValueOnce([
      {
        id: "run_1",
        kind: "research",
        metadata: { topic: "alpha" },
        projectId: "p1",
        status: "running",
      },
    ]);

    const res = await GET(
      new Request(
        "http://localhost/api/search?q=alpha&scope=global&types=runs",
      ),
    );

    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      results: Array<{ id: string; type: string; href: string }>;
    };
    expect(payload.results).toEqual([
      {
        href: "/projects/p1/runs/run_1",
        id: "run_1",
        provenance: { kind: "research", projectId: "p1", status: "running" },
        snippet: "Meta: topic",
        title: "research run · running",
        type: "run",
      },
    ]);
  });

  it("keeps legacy project-scoped requests working", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/search?q=test&projectId=p1"),
    );

    expect(res.status).toBe(200);
    expect(state.retrieveProjectChunks).toHaveBeenCalledTimes(1);
    expect(state.retrieveProjectArtifacts).toHaveBeenCalledTimes(1);
  });

  it("rejects legacy project-scoped requests when the user does not own the project", async () => {
    const GET = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/search?q=test&projectId=p1"),
    );

    // Convention: do not leak project existence across users.
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
    expect(state.retrieveProjectChunks).not.toHaveBeenCalled();
    expect(state.retrieveProjectArtifacts).not.toHaveBeenCalled();
  });

  it("returns 429 when search rate limit is exceeded", async () => {
    const GET = await loadRoute();
    state.limitSearchRequest.mockResolvedValueOnce({
      limit: 60,
      remaining: 0,
      reset: Date.now() + 30_000,
      retryAfterSeconds: 30,
      success: false,
    });

    const res = await GET(new Request("http://localhost/api/search?q=alpha"));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "rate_limited" },
    });
    expect(res.headers.get("Retry-After")).toBe("30");
  });
});
