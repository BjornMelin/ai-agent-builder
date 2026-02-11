import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDto } from "@/lib/data/projects.server";

const state = vi.hoisted(() => ({
  budgets: {
    maxEmbedBatchSize: 64,
    maxUploadBytes: 1024,
    maxVectorTopK: 12,
    toolCacheTtlSeconds: 600,
  },
  env: {
    blob: { readWriteToken: "blob-token" },
  },
  getProjectByIdForUser: vi.fn(),
  handleUpload: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: (...args: unknown[]) => state.handleUpload(...args),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/config/budgets.server", () => ({
  budgets: state.budgets,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
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

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
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
  vi.resetModules();

  state.budgets.maxUploadBytes = 1024;
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectByIdForUser.mockResolvedValue(baseProject);
  state.handleUpload.mockResolvedValue({
    clientToken: "vercel_blob_client_token",
    type: "blob.generate-client-token",
  });
});

describe("POST /api/upload", () => {
  it("proxies token exchange through handleUpload and returns clientToken", async () => {
    const POST = await loadRoute();

    const res = await POST(
      buildRequest({
        payload: {
          clientPayload: JSON.stringify({ projectId }),
          multipart: false,
          pathname: `projects/${projectId}/uploads/alpha.txt`,
        },
        type: "blob.generate-client-token",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      clientToken: "vercel_blob_client_token",
    });

    expect(state.handleUpload).toHaveBeenCalledTimes(1);
  });

  it("scopes token generation to the authenticated user's project in onBeforeGenerateToken", async () => {
    const POST = await loadRoute();

    await POST(
      buildRequest({
        payload: {
          clientPayload: JSON.stringify({ projectId }),
          multipart: false,
          pathname: `projects/${projectId}/uploads/alpha.txt`,
        },
        type: "blob.generate-client-token",
      }),
    );

    const call = state.handleUpload.mock.calls[0]?.[0] as
      | undefined
      | {
          onBeforeGenerateToken?: (
            pathname: string,
            clientPayload: string | null,
            multipart: boolean,
          ) => Promise<Record<string, unknown>>;
        };

    expect(call?.onBeforeGenerateToken).toBeTypeOf("function");

    const opts = await call?.onBeforeGenerateToken?.(
      `projects/${projectId}/uploads/alpha.txt`,
      JSON.stringify({ projectId }),
      false,
    );

    expect(state.getProjectByIdForUser).toHaveBeenCalledWith(projectId, "user");
    expect(opts).toMatchObject({
      addRandomSuffix: true,
      allowOverwrite: false,
      maximumSizeInBytes: 1024,
    });
    expect(
      (opts as { allowedContentTypes?: unknown }).allowedContentTypes,
    ).toBeTruthy();
  });

  it("rejects invalid clientPayload", async () => {
    const POST = await loadRoute();

    await POST(
      buildRequest({
        payload: {
          clientPayload: "not-json",
          multipart: false,
          pathname: `projects/${projectId}/uploads/alpha.txt`,
        },
        type: "blob.generate-client-token",
      }),
    );

    const call = state.handleUpload.mock.calls[0]?.[0] as
      | undefined
      | {
          onBeforeGenerateToken?: (
            pathname: string,
            clientPayload: string | null,
            multipart: boolean,
          ) => Promise<Record<string, unknown>>;
        };

    await expect(
      call?.onBeforeGenerateToken?.(
        `projects/${projectId}/uploads/alpha.txt`,
        "not-json",
        false,
      ),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("rejects invalid upload paths", async () => {
    const POST = await loadRoute();

    await POST(
      buildRequest({
        payload: {
          clientPayload: JSON.stringify({ projectId }),
          multipart: false,
          pathname: `projects/${projectId}/not-uploads/alpha.txt`,
        },
        type: "blob.generate-client-token",
      }),
    );

    const call = state.handleUpload.mock.calls[0]?.[0] as
      | undefined
      | {
          onBeforeGenerateToken?: (
            pathname: string,
            clientPayload: string | null,
            multipart: boolean,
          ) => Promise<Record<string, unknown>>;
        };

    await expect(
      call?.onBeforeGenerateToken?.(
        `projects/${projectId}/not-uploads/alpha.txt`,
        JSON.stringify({ projectId }),
        false,
      ),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("rejects upload paths that do not match the strict projects/{id}/uploads/{objectKey} shape", async () => {
    const POST = await loadRoute();

    await POST(
      buildRequest({
        payload: {
          clientPayload: JSON.stringify({ projectId }),
          multipart: false,
          pathname: `projects/${projectId}/uploads/alpha.txt`,
        },
        type: "blob.generate-client-token",
      }),
    );

    const call = state.handleUpload.mock.calls[0]?.[0] as
      | undefined
      | {
          onBeforeGenerateToken?: (
            pathname: string,
            clientPayload: string | null,
            multipart: boolean,
          ) => Promise<Record<string, unknown>>;
        };

    expect(call?.onBeforeGenerateToken).toBeTypeOf("function");

    const invalid = [
      `projects/${projectId}/uploads/a/b`,
      `projects/${projectId}/uploads/%2e%2e`,
      `projects/${projectId}/uploads/a%2Fb`,
    ] as const;

    for (const pathname of invalid) {
      await expect(
        call?.onBeforeGenerateToken?.(
          pathname,
          JSON.stringify({ projectId }),
          false,
        ),
      ).rejects.toMatchObject({ code: "bad_request" });
    }
  });
});
