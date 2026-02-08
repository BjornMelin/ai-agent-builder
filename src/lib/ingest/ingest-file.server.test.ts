import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import type { AppError } from "@/lib/core/errors";

type FakeChunk = Readonly<{
  id: string;
  projectId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  pageStart?: number;
  pageEnd?: number;
  tokenCount?: number;
}>;

const state = vi.hoisted(() => ({
  chunkDocument: vi.fn(),
  embedTexts: vi.fn(),
  extractDocument: vi.fn(),
  getDb: vi.fn(),
  vectorDelete: vi.fn(),
  vectorNamespace: vi.fn(),
  vectorUpsert: vi.fn(),
}));

vi.mock("@/lib/ingest/extract/extract-document.server", () => ({
  extractDocument: state.extractDocument,
}));

vi.mock("@/lib/ingest/chunk/chunk-document.server", () => ({
  chunkDocument: state.chunkDocument,
}));

vi.mock("@/lib/ai/embeddings.server", () => ({
  embedTexts: state.embedTexts,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

vi.mock("@/lib/upstash/vector.server", () => ({
  getVectorIndex: () => ({ namespace: state.vectorNamespace }),
  projectChunksNamespace: (projectId: string) => `project:${projectId}:chunks`,
}));

function createFakeDb() {
  const tx = {
    delete: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    insert: vi
      .fn()
      .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  } as unknown as DbClient;

  const db = {
    delete: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: DbClient) => Promise<unknown>) => {
        await cb(tx);
      }),
  };

  return { db, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.vectorDelete.mockResolvedValue(undefined);
  state.vectorUpsert.mockResolvedValue(undefined);
  state.vectorNamespace.mockReturnValue({
    delete: state.vectorDelete,
    upsert: state.vectorUpsert,
  });

  const { db } = createFakeDb();
  state.getDb.mockReturnValue(db);

  state.extractDocument.mockResolvedValue({
    fileId: "file_1",
    mimeType: "text/plain",
    name: "a.txt",
    sections: [{ ref: "text", text: "hello" }],
  });
});

describe("ingestFile", () => {
  it("ingests, persists chunks, and indexes vectors", async () => {
    const chunks: readonly FakeChunk[] = [
      {
        chunkIndex: 0,
        content: "hello",
        contentHash: "h1",
        fileId: "file_1",
        id: "file_1:0",
        projectId: "proj_1",
        tokenCount: 1,
      },
      {
        chunkIndex: 1,
        content: "world",
        contentHash: "h2",
        fileId: "file_1",
        id: "file_1:1",
        projectId: "proj_1",
        tokenCount: 1,
      },
    ];
    state.chunkDocument.mockReturnValue(chunks);
    state.embedTexts.mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const { ingestFile } = await import("@/lib/ingest/ingest-file.server");
    const res = await ingestFile({
      bytes: new Uint8Array([1, 2, 3]),
      fileId: "file_1",
      mimeType: "text/plain",
      name: "a.txt",
      projectId: "proj_1",
    });

    expect(res).toEqual({ chunksIndexed: 2, fileId: "file_1" });
    expect(state.vectorNamespace).toHaveBeenCalledWith("project:proj_1:chunks");
    expect(state.vectorDelete).toHaveBeenCalledWith({ prefix: "file_1:" });
    expect(state.vectorUpsert).toHaveBeenCalledTimes(1);
  });

  it("throws ingest_failed when no chunks are produced", async () => {
    state.chunkDocument.mockReturnValue([]);
    state.embedTexts.mockResolvedValue([]);

    const { ingestFile } = await import("@/lib/ingest/ingest-file.server");
    await expect(
      ingestFile({
        bytes: new Uint8Array([1, 2, 3]),
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
      }),
    ).rejects.toMatchObject({
      code: "ingest_failed",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("throws embed_failed when embedding results do not match chunk count", async () => {
    const chunks: readonly FakeChunk[] = [
      {
        chunkIndex: 0,
        content: "hello",
        contentHash: "h1",
        fileId: "file_1",
        id: "file_1:0",
        projectId: "proj_1",
      },
      {
        chunkIndex: 1,
        content: "world",
        contentHash: "h2",
        fileId: "file_1",
        id: "file_1:1",
        projectId: "proj_1",
      },
    ];
    state.chunkDocument.mockReturnValue(chunks);
    state.embedTexts.mockResolvedValue([[0.1, 0.2]]);

    const { ingestFile } = await import("@/lib/ingest/ingest-file.server");
    await expect(
      ingestFile({
        bytes: new Uint8Array([1, 2, 3]),
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
      }),
    ).rejects.toMatchObject({
      code: "embed_failed",
      status: 500,
    } satisfies Partial<AppError>);
  });

  it("cleans up vectors and DB rows when vector upsert fails", async () => {
    const { db } = createFakeDb();
    state.getDb.mockReturnValue(db);

    const chunks: readonly FakeChunk[] = [
      {
        chunkIndex: 0,
        content: "hello",
        contentHash: "h1",
        fileId: "file_1",
        id: "file_1:0",
        projectId: "proj_1",
      },
    ];
    state.chunkDocument.mockReturnValue(chunks);
    state.embedTexts.mockResolvedValue([[0.1, 0.2]]);

    state.vectorUpsert.mockRejectedValueOnce(new Error("upsert failed"));

    const { ingestFile } = await import("@/lib/ingest/ingest-file.server");
    await expect(
      ingestFile({
        bytes: new Uint8Array([1, 2, 3]),
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        projectId: "proj_1",
      }),
    ).rejects.toMatchObject({ message: "upsert failed" });

    // Best-effort cleanup attempts.
    expect(state.vectorDelete).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- This is a mock call assertion, not a Drizzle query.
    expect(db.delete).toHaveBeenCalledTimes(1);
  });
});
