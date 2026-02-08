import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";

type CitationRow = Readonly<{
  id: string;
  projectId: string;
  artifactId: string | null;
  sourceType: string;
  sourceRef: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}>;

const state = vi.hoisted(() => ({
  findMany: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.getDb.mockReturnValue({
    query: {
      citationsTable: {
        findMany: state.findMany,
      },
    },
  });
});

describe("citations DAL", () => {
  it("insertArtifactCitationsTx is a no-op for empty citations", async () => {
    const { insertArtifactCitationsTx } = await import(
      "@/lib/data/citations.server"
    );

    const tx = {
      insert: vi.fn(),
    } as unknown as DbClient;

    await insertArtifactCitationsTx(tx, {
      artifactId: "art_1",
      citations: [],
      projectId: "proj_1",
    });

    expect(
      (tx as unknown as { insert: unknown }).insert,
    ).not.toHaveBeenCalled();
  });

  it("insertArtifactCitationsTx maps payload default {} and preserves source fields", async () => {
    const { insertArtifactCitationsTx } = await import(
      "@/lib/data/citations.server"
    );

    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    const insertSpy = vi.fn().mockReturnValue({ values: valuesSpy });
    const tx = { insert: insertSpy } as unknown as DbClient;

    await insertArtifactCitationsTx(tx, {
      artifactId: "art_1",
      citations: [
        { payload: { a: 1 }, sourceRef: "ref-a", sourceType: "web" },
        { sourceRef: "ref-b", sourceType: "upload" },
      ],
      projectId: "proj_1",
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(valuesSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        artifactId: "art_1",
        payload: { a: 1 },
        projectId: "proj_1",
        sourceRef: "ref-a",
        sourceType: "web",
      }),
      expect.objectContaining({
        artifactId: "art_1",
        payload: {},
        projectId: "proj_1",
        sourceRef: "ref-b",
        sourceType: "upload",
      }),
    ]);
  });

  it("listCitationsByArtifactIds returns [] for empty input without hitting the DB", async () => {
    const { listCitationsByArtifactIds } = await import(
      "@/lib/data/citations.server"
    );

    await expect(listCitationsByArtifactIds([])).resolves.toEqual([]);
    expect(state.findMany).not.toHaveBeenCalled();
  });

  it("listCitationsByArtifactIds maps rows to DTOs and preserves null artifactId", async () => {
    const { listCitationsByArtifactIds } = await import(
      "@/lib/data/citations.server"
    );

    const rows: readonly CitationRow[] = [
      {
        artifactId: "art_1",
        createdAt: new Date(0),
        id: "cit_1",
        payload: { x: 1 },
        projectId: "proj_1",
        sourceRef: "https://example.com",
        sourceType: "web",
      },
      {
        artifactId: null,
        createdAt: new Date(1),
        id: "cit_2",
        payload: {},
        projectId: "proj_1",
        sourceRef: "upload:1",
        sourceType: "upload",
      },
    ];
    state.findMany.mockResolvedValueOnce(rows);

    const result = await listCitationsByArtifactIds(["art_1", "art_2"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      artifactId: "art_1",
      id: "cit_1",
      projectId: "proj_1",
      sourceRef: "https://example.com",
      sourceType: "web",
    });
    expect(result[0]?.createdAt).toBe(new Date(0).toISOString());
    expect(result[1]?.artifactId).toBeNull();
  });
});
