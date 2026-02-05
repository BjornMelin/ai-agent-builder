import { beforeEach, describe, expect, it, vi } from "vitest";

type VectorQueryResult = Readonly<{
  id: string;
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

describe("retrieveProjectArtifacts", () => {
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
});
