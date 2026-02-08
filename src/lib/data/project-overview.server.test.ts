import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  artifactsFindFirst: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  execute: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  runsFindFirst: vi.fn(),
  tags: {
    tagArtifactsIndex: vi.fn((projectId: string) => `artifacts:${projectId}`),
    tagProject: vi.fn((projectId: string) => `project:${projectId}`),
    tagUploadsIndex: vi.fn((projectId: string) => `uploads:${projectId}`),
  },
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
}));

vi.mock("@/lib/cache/tags", () => ({
  tagArtifactsIndex: (projectId: string) =>
    state.tags.tagArtifactsIndex(projectId),
  tagProject: (projectId: string) => state.tags.tagProject(projectId),
  tagUploadsIndex: (projectId: string) => state.tags.tagUploadsIndex(projectId),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    execute: state.execute,
    query: {
      artifactsTable: { findFirst: state.artifactsFindFirst },
      runsTable: { findFirst: state.runsFindFirst },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
});

describe("project overview readers", () => {
  it("throws not_found when the project is not accessible", async () => {
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const { getProjectCorpusOverview } = await import(
      "@/lib/data/project-overview.server"
    );

    await expect(
      getProjectCorpusOverview("proj_1", "user_1"),
    ).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    } satisfies Partial<AppError>);
  });

  it("computes corpus overview and normalizes lastUploadAt", async () => {
    state.execute.mockResolvedValueOnce({
      rows: [
        {
          indexed_chunks: 2,
          indexed_files: 1,
          indexed_tokens: 10,
          last_upload_at: "2026-02-07T00:00:00.000Z",
          total_bytes: 123,
          total_files: 3,
        },
      ],
    });

    const { getProjectCorpusOverview } = await import(
      "@/lib/data/project-overview.server"
    );
    const res = await getProjectCorpusOverview("proj_1", "user_1");

    expect(res).toEqual({
      indexedChunks: 2,
      indexedFiles: 1,
      indexedTokens: 10,
      lastUploadAt: "2026-02-07T00:00:00.000Z",
      totalBytes: 123,
      totalFiles: 3,
    });
  });

  it("computes run overview with default-zero statusCounts and a lastRun snapshot", async () => {
    state.execute.mockResolvedValueOnce({
      rows: [
        { count: 2, status: "succeeded" },
        { count: 1, status: "failed" },
      ],
    });
    state.runsFindFirst.mockResolvedValueOnce({
      createdAt: new Date(0),
      id: "run_1",
      kind: "research",
      status: "succeeded",
      updatedAt: new Date(1),
    });

    const { getProjectRunOverview } = await import(
      "@/lib/data/project-overview.server"
    );
    const res = await getProjectRunOverview("proj_1", "user_1");

    expect(res.totalRuns).toBe(3);
    expect(res.statusCounts.succeeded).toBe(2);
    expect(res.statusCounts.failed).toBe(1);
    expect(res.statusCounts.running).toBe(0);
    expect(res.lastRun).toMatchObject({ id: "run_1", kind: "research" });
  });

  it("computes artifact overview (latestKeys + lastArtifact)", async () => {
    state.execute.mockResolvedValueOnce({ rows: [{ count: 7 }] });
    state.artifactsFindFirst.mockResolvedValueOnce({
      createdAt: new Date(0),
      id: "art_1",
      kind: "PRD",
      logicalKey: "PRD",
      version: 2,
    });

    const { getProjectArtifactOverview } = await import(
      "@/lib/data/project-overview.server"
    );
    const res = await getProjectArtifactOverview("proj_1", "user_1");

    expect(res.latestKeys).toBe(7);
    expect(res.lastArtifact).toMatchObject({
      id: "art_1",
      kind: "PRD",
      logicalKey: "PRD",
      version: 2,
    });
  });
});
