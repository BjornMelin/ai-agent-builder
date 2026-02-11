import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectFileDto } from "@/lib/data/files.server";
import type { ProjectDto } from "@/lib/data/projects.server";
import type { IngestFileResult } from "@/lib/ingest/ingest-file.server";

type UpsertFileInput = Readonly<{
  projectId: string;
  name: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
}>;

const state = vi.hoisted(() => ({
  budgets: {
    maxEmbedBatchSize: 64,
    maxUploadBytes: 1024,
    maxVectorTopK: 12,
    toolCacheTtlSeconds: 600,
  },
  del: vi.fn(),
  env: {
    app: { baseUrl: "https://app.example.com" },
    blob: { readWriteToken: "blob-token" },
    runtime: { isVercel: false },
  },
  fetch: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getProjectFileBySha256: vi.fn(),
  ingestFile: vi.fn(),
  publishJSON: vi.fn(),
  requireAppUserApi: vi.fn(),
  revalidateTag: vi.fn(),
  upsertProjectFile: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: state.del,
}));

vi.mock("next/cache", () => ({
  revalidateTag: state.revalidateTag,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/config/budgets.server", () => ({
  budgets: state.budgets,
}));

vi.mock("@/lib/data/files.server", () => ({
  getProjectFileBySha256: state.getProjectFileBySha256,
  upsertProjectFile: state.upsertProjectFile,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/ingest/ingest-file.server", () => ({
  ingestFile: state.ingestFile,
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  getQstashClient: () => ({
    publishJSON: state.publishJSON,
  }),
}));

const projectId = "proj_123";
const now = new Date(0).toISOString();

const baseProject = {
  createdAt: now,
  id: projectId,
  name: "Project",
  slug: "project",
  status: "active",
  updatedAt: now,
} satisfies ProjectDto;

function buildRequest(input: unknown): Request {
  return new Request("http://localhost/api/upload/register", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/upload/register/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.env.runtime.isVercel = false;
  state.budgets.maxUploadBytes = 1024;

  vi.stubGlobal("fetch", state.fetch);

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectByIdForUser.mockResolvedValue(baseProject);
  state.getProjectFileBySha256.mockResolvedValue(null);
  state.del.mockResolvedValue(undefined);
  state.publishJSON.mockResolvedValue({ messageId: "msg", url: "https://q" });
  state.ingestFile.mockResolvedValue({
    chunksIndexed: 2,
    fileId: "file_1",
  } satisfies IngestFileResult);
  state.upsertProjectFile.mockImplementation(async (input: UpsertFileInput) => {
    return {
      createdAt: now,
      id: `file_${input.sha256.slice(0, 6)}`,
      mimeType: input.mimeType,
      name: input.name,
      projectId: input.projectId,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
    } satisfies ProjectFileDto;
  });
});

describe("POST /api/upload/register", () => {
  it("registers multiple blobs and enqueues async ingestion", async () => {
    const POST = await loadRoute();

    state.fetch.mockImplementation(
      async () =>
        new Response(new Blob(["alpha"], { type: "text/plain" }), {
          status: 200,
        }),
    );

    const blobA = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 5,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const blobB = {
      contentType: "text/plain",
      originalName: "beta.txt",
      size: 4,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/beta.txt`,
    };

    const res = await POST(
      buildRequest({ async: true, blobs: [blobA, blobB], projectId }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.files).toHaveLength(2);
    expect(state.publishJSON).toHaveBeenCalledTimes(2);
    expect(state.ingestFile).not.toHaveBeenCalled();
    expect(state.revalidateTag).toHaveBeenCalledTimes(2);
    for (const call of state.revalidateTag.mock.calls) {
      expect(call[1]).toBe("max");
    }
  });

  it("falls back to inline ingestion when QStash publish fails locally", async () => {
    const POST = await loadRoute();

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    state.publishJSON.mockRejectedValueOnce(new Error("no qstash"));
    state.env.runtime.isVercel = false;
    state.fetch.mockResolvedValue(
      new Response(new Blob(["alpha"], { type: "text/plain" }), {
        status: 200,
      }),
    );

    const blob = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 5,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const res = await POST(
      buildRequest({ async: true, blobs: [blob], projectId }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files[0].ingest?.chunksIndexed).toBe(2);
    expect(state.ingestFile).toHaveBeenCalledTimes(1);
    expect(state.revalidateTag).toHaveBeenCalledTimes(2);
    debugSpy.mockRestore();
  });

  it("rejects when the downloaded blob exceeds the upload budget (even if request size is small)", async () => {
    const POST = await loadRoute();

    state.budgets.maxUploadBytes = 3;
    state.fetch.mockResolvedValue(
      new Response(new Blob(["abcd"], { type: "text/plain" }), { status: 200 }),
    );

    const blob = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 1, // falsified/smaller than reality
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const res = await POST(buildRequest({ blobs: [blob], projectId }));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
    expect(state.upsertProjectFile).not.toHaveBeenCalled();
    expect(state.ingestFile).not.toHaveBeenCalled();
  });

  it("rejects when Content-Length exceeds the upload budget", async () => {
    const POST = await loadRoute();

    state.budgets.maxUploadBytes = 1;
    state.fetch.mockResolvedValue(
      new Response(new Blob(["ab"], { type: "text/plain" }), {
        headers: { "content-length": "2" },
        status: 200,
      }),
    );

    const blob = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 1,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const res = await POST(buildRequest({ blobs: [blob], projectId }));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
    expect(state.upsertProjectFile).not.toHaveBeenCalled();
    expect(state.ingestFile).not.toHaveBeenCalled();
  });

  it("returns an existing file and deletes the uploaded blob", async () => {
    const POST = await loadRoute();

    const existing = {
      createdAt: now,
      id: "file_existing",
      mimeType: "text/plain",
      name: "alpha.txt",
      projectId,
      sha256: "existing",
      sizeBytes: 5,
      storageKey: "https://blob.test/existing",
    } satisfies ProjectFileDto;

    state.getProjectFileBySha256.mockResolvedValueOnce(existing);
    state.fetch.mockResolvedValue(
      new Response(new Blob(["alpha"], { type: "text/plain" }), {
        status: 200,
      }),
    );

    const blob = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 5,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const res = await POST(buildRequest({ blobs: [blob], projectId }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([existing]);
    expect(state.del).toHaveBeenCalledTimes(1);
    expect(state.upsertProjectFile).not.toHaveBeenCalled();
    expect(state.ingestFile).not.toHaveBeenCalled();
    expect(state.revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects unsupported mime types", async () => {
    const POST = await loadRoute();

    const blob = {
      contentType: "image/png",
      originalName: "image.png",
      size: 5,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/image.png`,
    };
    const res = await POST(buildRequest({ blobs: [blob], projectId }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "unsupported_file_type" },
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("rejects files that exceed the upload size budget", async () => {
    const POST = await loadRoute();

    state.budgets.maxUploadBytes = 1;
    const blob = {
      contentType: "text/plain",
      originalName: "alpha.txt",
      size: 2,
      url: `https://1.public.blob.vercel-storage.com/projects/${projectId}/uploads/alpha.txt`,
    };
    const res = await POST(buildRequest({ blobs: [blob], projectId }));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
