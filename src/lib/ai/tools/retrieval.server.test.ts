import { beforeEach, describe, expect, it, vi } from "vitest";

type VectorQueryResult = Readonly<{
  id: unknown;
  metadata?: Readonly<Record<string, unknown>>;
  score: number;
}>;

const state = vi.hoisted(() => ({
  embedText: vi.fn(),
  getRedis: vi.fn(),
  vectorNamespace: vi.fn(),
  vectorQuery: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings.server", () => ({
  embedText: state.embedText,
}));

vi.mock("@/lib/upstash/redis.server", () => ({
  getRedis: state.getRedis,
}));

vi.mock("@/lib/upstash/vector.server", () => ({
  getVectorIndex: () => ({ namespace: state.vectorNamespace }),
  projectArtifactsNamespace: (projectId: string) =>
    `project:${projectId}:artifacts`,
  projectChunksNamespace: (projectId: string) => `project:${projectId}:chunks`,
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/ai/tools/retrieval.server");
}

beforeEach(() => {
  vi.clearAllMocks();

  state.embedText.mockResolvedValue([0.1, 0.2, 0.3]);
  state.vectorQuery.mockResolvedValue([]);
  state.vectorNamespace.mockReturnValue({ query: state.vectorQuery });

  state.getRedis.mockImplementation(() => {
    throw new Error("Redis not configured");
  });
});

describe("retrieveProjectChunks", () => {
  it("rejects invalid projectId formats", async () => {
    const { retrieveProjectChunks } = await loadModule();
    await expect(
      retrieveProjectChunks({ projectId: "not-a-uuid", q: "hi" }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("rejects topK values outside the configured budget", async () => {
    const { retrieveProjectChunks } = await loadModule();
    const projectId = "11111111-1111-4111-8111-111111111111";
    await expect(
      retrieveProjectChunks({ projectId, q: "hi", topK: 0 }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("returns cached hits from Redis when present", async () => {
    const cached = [
      {
        id: "hit_1",
        provenance: {
          chunkIndex: 0,
          fileId: "file_1",
          projectId: "11111111-1111-4111-8111-111111111111",
          type: "chunk",
        },
        score: 0.9,
        snippet: "cached",
      },
    ] as const;

    const redis = {
      get: vi.fn(async () => cached),
      setex: vi.fn(async () => {}),
    };
    state.getRedis.mockReturnValueOnce(redis);

    const { retrieveProjectChunks } = await loadModule();
    const res = await retrieveProjectChunks({
      projectId: "11111111-1111-4111-8111-111111111111",
      q: "hi",
      topK: 3,
    });

    expect(res).toEqual(cached);
    expect(state.embedText).not.toHaveBeenCalled();
    expect(state.vectorQuery).not.toHaveBeenCalled();
  });

  it("queries vectors, filters non-chunk metadata, and caches best-effort", async () => {
    const redis = {
      get: vi.fn(async () => null),
      setex: vi.fn(async () => {
        throw new Error("redis down");
      }),
    };
    state.getRedis.mockReturnValueOnce(redis);

    const projectId = "11111111-1111-4111-8111-111111111111";
    state.vectorQuery.mockResolvedValueOnce([
      {
        id: "hit_1",
        metadata: {
          chunkIndex: 1,
          fileId: "file_1",
          pageEnd: 2,
          pageStart: 1,
          projectId,
          snippet: "hello",
          type: "chunk",
        },
        score: 0.99,
      },
      { id: "hit_2", metadata: { type: "artifact" }, score: 0.5 },
      { id: "hit_3", score: 0.1 },
    ] satisfies readonly VectorQueryResult[]);

    const { retrieveProjectChunks } = await loadModule();
    const hits = await retrieveProjectChunks({ projectId, q: "hi", topK: 2 });

    expect(hits).toEqual([
      {
        id: "hit_1",
        provenance: {
          chunkIndex: 1,
          fileId: "file_1",
          pageEnd: 2,
          pageStart: 1,
          projectId,
          type: "chunk",
        },
        score: 0.99,
        snippet: "hello",
      },
    ]);
    expect(redis.setex).toHaveBeenCalled();
  });
});

describe("retrieveProjectArtifacts", () => {
  it("rejects invalid projectId formats", async () => {
    const { retrieveProjectArtifacts } = await loadModule();
    await expect(
      retrieveProjectArtifacts({ projectId: "not-a-uuid", q: "hi" }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("returns cached hits from Redis when present", async () => {
    const cached = [
      {
        id: "hit_1",
        provenance: {
          artifactId: "art_1",
          kind: "PRD",
          logicalKey: "PRD",
          projectId: "11111111-1111-4111-8111-111111111111",
          type: "artifact",
          version: 1,
        },
        score: 0.9,
        snippet: "cached",
        title: "PRD v1",
      },
    ] as const;

    const redis = {
      get: vi.fn(async () => cached),
      setex: vi.fn(async () => {}),
    };
    state.getRedis.mockReturnValueOnce(redis);

    const { retrieveProjectArtifacts } = await loadModule();
    const res = await retrieveProjectArtifacts({
      projectId: "11111111-1111-4111-8111-111111111111",
      q: "hi",
      topK: 3,
    });

    expect(res).toEqual(cached);
    expect(state.embedText).not.toHaveBeenCalled();
    expect(state.vectorQuery).not.toHaveBeenCalled();
  });

  it("prefers the latest artifact version metadata for each logical key", async () => {
    const { retrieveProjectArtifacts } = await loadModule();

    const projectId = "11111111-1111-4111-8111-111111111111";
    const results: readonly VectorQueryResult[] = [
      {
        id: "old-1",
        metadata: {
          artifactId: "art_v1",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 1,
          projectId,
          snippet: "old",
          title: "PRD v1",
          type: "artifact",
        },
        score: 0.95,
      },
      {
        id: "old-2",
        metadata: {
          artifactId: "art_v1",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 1,
          projectId,
          snippet: "old 2",
          title: "PRD v1 duplicate",
          type: "artifact",
        },
        score: 0.9,
      },
      {
        id: "new-1",
        metadata: {
          artifactId: "art_v2",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 2,
          projectId,
          snippet: "new",
          title: "PRD v2",
          type: "artifact",
        },
        score: 0.6,
      },
      {
        id: "arch-1",
        metadata: {
          artifactId: "arch_v1",
          artifactKey: "ARCH",
          artifactKind: "ARCH",
          artifactVersion: 1,
          projectId,
          snippet: "arch",
          title: "ARCH",
          type: "artifact",
        },
        score: 0.5,
      },
    ];

    state.vectorQuery.mockResolvedValueOnce(results);

    const hits = await retrieveProjectArtifacts({
      projectId,
      q: "design",
      topK: 2,
    });

    expect(state.vectorQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: `projectId = '${projectId}' AND type = 'artifact'`,
        includeMetadata: true,
        topK: 6,
      }),
    );

    expect(hits).toHaveLength(2);
    expect(
      hits.some(
        (hit) =>
          hit.provenance.kind === "PRD" &&
          hit.provenance.logicalKey === "PRD" &&
          hit.provenance.version === 1,
      ),
    ).toBe(false);

    expect(hits[0]?.provenance).toMatchObject({
      kind: "PRD",
      logicalKey: "PRD",
      version: 2,
    });
    expect(hits[1]?.provenance).toMatchObject({
      kind: "ARCH",
      logicalKey: "ARCH",
      version: 1,
    });
  });

  it("deduplicates multiple chunk hits from the same latest artifact version", async () => {
    const { retrieveProjectArtifacts } = await loadModule();

    const projectId = "11111111-1111-4111-8111-111111111111";
    const results: readonly VectorQueryResult[] = [
      {
        id: "prd-v2-chunk-1",
        metadata: {
          artifactId: "art_v2",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 2,
          projectId,
          snippet: "prd chunk 1",
          title: "PRD v2",
          type: "artifact",
        },
        score: 0.95,
      },
      {
        id: "prd-v2-chunk-2",
        metadata: {
          artifactId: "art_v2",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 2,
          projectId,
          snippet: "prd chunk 2",
          title: "PRD v2",
          type: "artifact",
        },
        score: 0.93,
      },
      {
        id: "prd-v2-chunk-3",
        metadata: {
          artifactId: "art_v2",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 2,
          projectId,
          snippet: "prd chunk 3",
          title: "PRD v2",
          type: "artifact",
        },
        score: 0.91,
      },
      {
        id: "arch-v1-chunk-1",
        metadata: {
          artifactId: "arch_v1",
          artifactKey: "ARCH",
          artifactKind: "ARCH",
          artifactVersion: 1,
          projectId,
          snippet: "arch chunk 1",
          title: "ARCH v1",
          type: "artifact",
        },
        score: 0.7,
      },
    ];

    state.vectorQuery.mockResolvedValueOnce(results);

    const hits = await retrieveProjectArtifacts({
      projectId,
      q: "architecture plan",
      topK: 2,
    });

    expect(hits).toHaveLength(2);
    expect(
      hits.filter(
        (hit) =>
          hit.provenance.kind === "PRD" && hit.provenance.logicalKey === "PRD",
      ),
    ).toHaveLength(1);
    expect(hits[0]?.id).toBe("prd-v2-chunk-1");
    expect(hits[1]?.id).toBe("arch-v1-chunk-1");
  });

  it("filters invalid artifact candidates and falls back to a synthetic title", async () => {
    const redis = {
      get: vi.fn(async () => null),
      setex: vi.fn(async () => {}),
    };
    state.getRedis.mockReturnValueOnce(redis);

    const { retrieveProjectArtifacts } = await loadModule();
    const projectId = "11111111-1111-4111-8111-111111111111";
    state.vectorQuery.mockResolvedValueOnce([
      // filtered (no metadata)
      { id: "no-meta", score: 0.2 },
      // filtered (wrong type)
      { id: "wrong-type", metadata: { type: "chunk" }, score: 0.2 },
      // filtered (null id)
      { id: null, metadata: { type: "artifact" }, score: 0.2 },
      // filtered (missing required fields)
      { id: "bad", metadata: { projectId, type: "artifact" }, score: 0.2 },
      // accepted with missing title/snippet
      {
        id: "ok",
        metadata: {
          artifactId: "art_1",
          artifactKey: "PRD",
          artifactKind: "PRD",
          artifactVersion: 1,
          projectId,
          type: "artifact",
        },
        score: 0.8,
      },
    ] satisfies readonly VectorQueryResult[]);

    const hits = await retrieveProjectArtifacts({
      projectId,
      q: "hi",
      topK: 3,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe("PRD PRD v1");
    expect(hits[0]?.snippet).toBe("");
    expect(redis.setex).toHaveBeenCalled();
  });
});
