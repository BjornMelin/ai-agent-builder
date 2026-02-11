import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectFileDto } from "@/lib/data/files.server";
import type { IngestFileResult } from "@/lib/ingest/ingest-file.server";

const state = vi.hoisted(() => ({
  getProjectFileById: vi.fn(),
  ingestFile: vi.fn(),
  revalidateTag: vi.fn(),
  verifyQstashSignatureAppRouter: vi.fn(
    (handler: (req: Request) => Promise<Response> | Response) => handler,
  ),
}));

vi.mock("next/cache", () => ({
  revalidateTag: state.revalidateTag,
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  verifyQstashSignatureAppRouter: state.verifyQstashSignatureAppRouter,
}));

vi.mock("@/lib/data/files.server", () => ({
  getProjectFileById: state.getProjectFileById,
}));

vi.mock("@/lib/ingest/ingest-file.server", () => ({
  ingestFile: state.ingestFile,
}));

const fileId = "file_123";
const projectId = "proj_123";
const now = new Date(0).toISOString();

const baseFile = {
  createdAt: now,
  id: fileId,
  mimeType: "text/plain",
  name: "alpha.txt",
  projectId,
  sha256: "sha",
  sizeBytes: 5,
  storageKey:
    "https://store.public.blob.vercel-storage.com/projects/proj_123/uploads/sha-alpha.txt",
} satisfies ProjectFileDto;

const originalFetch = globalThis.fetch;

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/jobs/ingest-file/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.verifyQstashSignatureAppRouter.mockImplementation(
    (handler: (req: Request) => Promise<Response> | Response) => handler,
  );
  state.getProjectFileById.mockResolvedValue(baseFile);
  state.ingestFile.mockResolvedValue({
    chunksIndexed: 2,
    fileId,
  } satisfies IngestFileResult);
  globalThis.fetch = vi.fn() as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /api/jobs/ingest-file", () => {
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
      new Request("http://localhost/api/jobs/ingest-file", {
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
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects when the file is missing or mismatched", async () => {
    const POST = await loadRoute();
    state.getProjectFileById.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
  });

  it("returns a blob fetch error when the download fails", async () => {
    const POST = await loadRoute();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    globalThis.fetch = fetchMock;

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "blob_fetch_failed" },
    });
  });

  it("rejects untrusted blob storage hosts", async () => {
    const POST = await loadRoute();
    state.getProjectFileById.mockResolvedValueOnce({
      ...baseFile,
      storageKey: "https://blob.test/projects/proj_123/uploads/file",
    });

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "blob_fetch_failed",
        message: "Untrusted blob storage host.",
      },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects blob paths that do not match the project", async () => {
    const POST = await loadRoute();
    state.getProjectFileById.mockResolvedValueOnce({
      ...baseFile,
      storageKey:
        "https://store.public.blob.vercel-storage.com/projects/other/uploads/sha-alpha.txt",
    });

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "blob_fetch_failed",
        message: "Blob path/project mismatch.",
      },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects when the blob content does not match the stored sha256", async () => {
    const POST = await loadRoute();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );
    globalThis.fetch = fetchMock;

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "blob_fetch_failed",
        message: "Blob content mismatch.",
      },
    });
    expect(state.ingestFile).not.toHaveBeenCalled();
  });

  it("rejects blob paths that contain dot-dot traversal segments", async () => {
    const POST = await loadRoute();
    state.getProjectFileById.mockResolvedValueOnce({
      ...baseFile,
      storageKey:
        "https://store.public.blob.vercel-storage.com/projects/proj_123/uploads/../secrets.txt",
    });

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "blob_fetch_failed",
        message: "Invalid blob storage path.",
      },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects blob paths that contain percent-encoded dot-dot traversal segments", async () => {
    const POST = await loadRoute();
    state.getProjectFileById.mockResolvedValueOnce({
      ...baseFile,
      storageKey:
        "https://store.public.blob.vercel-storage.com/projects/proj_123/uploads/%2e%2e/secrets.txt",
    });

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "blob_fetch_failed",
        message: "Invalid blob storage path.",
      },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns a timeout error when the blob fetch times out", async () => {
    const POST = await loadRoute();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    globalThis.fetch = fetchMock;

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "blob_fetch_failed" },
    });
  });

  it("ingests the file when the payload and blob are valid", async () => {
    const POST = await loadRoute();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      );
    globalThis.fetch = fetchMock;

    const crypto = await import("node:crypto");
    const digest = crypto
      .createHash("sha256")
      .update(Buffer.from([1, 2, 3]))
      .digest("hex");
    state.getProjectFileById.mockResolvedValueOnce({
      ...baseFile,
      sha256: digest,
    });

    const res = await POST(
      new Request("http://localhost/api/jobs/ingest-file", {
        body: JSON.stringify({ fileId, projectId }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ chunksIndexed: 2, fileId });
    expect(state.ingestFile).toHaveBeenCalledTimes(1);
    expect(state.revalidateTag).toHaveBeenCalledTimes(1);
    expect(state.revalidateTag).toHaveBeenCalledWith(
      expect.stringContaining(":uploads:index:"),
      "max",
    );
  });
});
