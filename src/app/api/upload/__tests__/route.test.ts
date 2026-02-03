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
  env: {
    app: { baseUrl: "https://app.example.com" },
    blob: { readWriteToken: "blob-token" },
    runtime: { isVercel: false },
  },
  getProjectById: vi.fn(),
  getProjectFileBySha256: vi.fn(),
  ingestFile: vi.fn(),
  publishJSON: vi.fn(),
  put: vi.fn(),
  requireAppUserApi: vi.fn(),
  upsertProjectFile: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: state.put,
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
  getProjectById: state.getProjectById,
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

type UploadBlob = Readonly<{ blob: Blob; name: string }>;

function buildRequest(
  files: UploadBlob[],
  options?: Readonly<{ async?: boolean; projectId?: string }>,
): Request {
  const form = new FormData();
  form.append("projectId", options?.projectId ?? projectId);
  if (options?.async) {
    form.append("async", "true");
  }
  for (const file of files) {
    form.append("file", file.blob, file.name);
  }
  return new Request("http://localhost/api/upload", {
    body: form,
    method: "POST",
  });
}

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/upload/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.env.runtime.isVercel = false;
  state.budgets.maxUploadBytes = 1024;

  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectById.mockResolvedValue(baseProject);
  state.getProjectFileBySha256.mockResolvedValue(null);
  state.put.mockResolvedValue({ url: "https://blob.test/file" });
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

describe("POST /api/upload", () => {
  it("uploads multiple files and enqueues async ingestion in parallel", async () => {
    const POST = await loadRoute();

    const fileA = {
      blob: new Blob(["alpha"], { type: "text/plain" }),
      name: "alpha.txt",
    };
    const fileB = {
      blob: new Blob(["beta"], { type: "text/plain" }),
      name: "beta.txt",
    };

    const res = await POST(buildRequest([fileA, fileB], { async: true }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.files).toHaveLength(2);
    expect(state.publishJSON).toHaveBeenCalledTimes(2);
    expect(state.ingestFile).not.toHaveBeenCalled();

    for (const call of state.publishJSON.mock.calls) {
      const [payload] = call;
      expect(payload).toMatchObject({
        label: "ingest-file",
        url: "https://app.example.com/api/jobs/ingest-file",
      });
      expect(payload.deduplicationId).toContain("ingest:");
      expect(payload.body).toMatchObject({ projectId });
    }
  });

  it("falls back to inline ingestion when QStash publish fails locally", async () => {
    const POST = await loadRoute();

    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    state.publishJSON.mockRejectedValueOnce(new Error("no qstash"));
    state.env.runtime.isVercel = false;

    const file = {
      blob: new Blob(["alpha"], { type: "text/plain" }),
      name: "alpha.txt",
    };
    const res = await POST(buildRequest([file], { async: true }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files[0].ingest?.chunksIndexed).toBe(2);
    expect(state.ingestFile).toHaveBeenCalledTimes(1);
    debugSpy.mockRestore();
  });

  it("returns an existing file without re-uploading", async () => {
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

    const file = {
      blob: new Blob(["alpha"], { type: "text/plain" }),
      name: "alpha.txt",
    };
    const res = await POST(buildRequest([file]));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([existing]);
    expect(state.put).not.toHaveBeenCalled();
    expect(state.upsertProjectFile).not.toHaveBeenCalled();
    expect(state.ingestFile).not.toHaveBeenCalled();
  });

  it("rejects unsupported mime types", async () => {
    const POST = await loadRoute();

    const file = {
      blob: new Blob(["data"], { type: "image/png" }),
      name: "image.png",
    };
    const res = await POST(buildRequest([file]));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "unsupported_file_type" },
    });
  });

  it("rejects files that exceed the upload size budget", async () => {
    const POST = await loadRoute();

    state.budgets.maxUploadBytes = 1;
    const file = {
      blob: new Blob(["too-big"], { type: "text/plain" }),
      name: "alpha.txt",
    };
    const res = await POST(buildRequest([file]));

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "file_too_large" },
    });
  });
});
