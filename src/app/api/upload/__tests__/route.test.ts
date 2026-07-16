import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  budgets: {
    maxEmbedBatchSize: 64,
    maxUploadBytes: 1024,
    maxVectorTopK: 12,
    toolCacheTtlSeconds: 600,
  },
  del: vi.fn(),
  env: {
    blob: { readWriteToken: "blob-token" },
  },
  handleUpload: vi.fn(),
  issueProjectUploadGrant: vi.fn(),
  removeRejectedProjectUploadGrant: vi.fn(),
  requireAppUserApi: vi.fn(),
  resolveProjectUploadCompletion: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: (...args: unknown[]) => state.handleUpload(...args),
}));

vi.mock("@vercel/blob", () => ({ del: state.del }));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/config/budgets.server", () => ({
  budgets: state.budgets,
}));

vi.mock("@/lib/data/project-upload-grants.server", () => ({
  issueProjectUploadGrant: state.issueProjectUploadGrant,
  PROJECT_UPLOAD_GRANT_TTL_MS: 300_000,
  removeRejectedProjectUploadGrant: state.removeRejectedProjectUploadGrant,
  resolveProjectUploadCompletion: state.resolveProjectUploadCompletion,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

const projectId = "proj_123";
const grantId = "11111111-1111-4111-8111-111111111111";

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

type HandleUploadCall = {
  onBeforeGenerateToken?: (
    pathname: string,
    clientPayload: string | null,
    multipart: boolean,
  ) => Promise<Record<string, unknown>>;
  onUploadCompleted?: (input: {
    blob: { pathname: string; url: string };
    tokenPayload?: string | null;
  }) => Promise<void>;
};

function getOnBeforeGenerateToken(): HandleUploadCall["onBeforeGenerateToken"] {
  const call = state.handleUpload.mock.calls[0]?.[0] as
    | HandleUploadCall
    | undefined;
  return call?.onBeforeGenerateToken;
}

function getOnUploadCompleted(): HandleUploadCall["onUploadCompleted"] {
  const call = state.handleUpload.mock.calls[0]?.[0] as
    | HandleUploadCall
    | undefined;
  return call?.onUploadCompleted;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.budgets.maxUploadBytes = 1024;
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.handleUpload.mockResolvedValue({
    clientToken: "vercel_blob_client_token",
    type: "blob.generate-client-token",
  });
  state.issueProjectUploadGrant.mockResolvedValue({ id: grantId });
  state.removeRejectedProjectUploadGrant.mockResolvedValue(undefined);
  state.resolveProjectUploadCompletion.mockResolvedValue("keep");
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

    const onBeforeGenerateToken = getOnBeforeGenerateToken();
    if (!onBeforeGenerateToken) {
      throw new Error("Missing onBeforeGenerateToken.");
    }

    const opts = await onBeforeGenerateToken(
      `projects/${projectId}/uploads/alpha.txt`,
      JSON.stringify({ projectId }),
      false,
    );

    expect(state.issueProjectUploadGrant).toHaveBeenCalledWith({
      expiresAt: expect.any(Date),
      pathname: `projects/${projectId}/uploads/alpha.txt`,
      projectId,
      userId: "user",
    });
    expect(opts).toMatchObject({
      addRandomSuffix: true,
      allowOverwrite: false,
      maximumSizeInBytes: 1024,
      tokenPayload: JSON.stringify({ grantId, projectId }),
    });
    expect(
      (opts as { allowedContentTypes?: unknown }).allowedContentTypes,
    ).toBeTruthy();
  });

  it("removes a completed upload when deletion won the lifecycle fence", async () => {
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
    state.resolveProjectUploadCompletion.mockResolvedValueOnce("delete");
    const onUploadCompleted = getOnUploadCompleted();
    if (!onUploadCompleted) throw new Error("Missing onUploadCompleted.");

    await onUploadCompleted({
      blob: {
        pathname: `projects/${projectId}/uploads/alpha-random-suffix.txt`,
        url: "https://store.blob.vercel-storage.com/projects/proj_123/uploads/alpha.txt",
      },
      tokenPayload: JSON.stringify({ grantId, projectId }),
    });

    expect(state.requireAppUserApi).not.toHaveBeenCalled();
    expect(state.del).toHaveBeenCalledWith(
      "https://store.blob.vercel-storage.com/projects/proj_123/uploads/alpha.txt",
      { token: "blob-token" },
    );
    expect(state.removeRejectedProjectUploadGrant).toHaveBeenCalledWith({
      grantId,
      projectId,
    });
  });

  it("settles an active upload grant without deleting its Blob", async () => {
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
    const onUploadCompleted = getOnUploadCompleted();
    if (!onUploadCompleted) throw new Error("Missing onUploadCompleted.");

    await onUploadCompleted({
      blob: {
        pathname: `projects/${projectId}/uploads/alpha-random-suffix.txt`,
        url: "https://store.blob.vercel-storage.com/projects/proj_123/uploads/alpha.txt",
      },
      tokenPayload: JSON.stringify({ grantId, projectId }),
    });

    expect(state.resolveProjectUploadCompletion).toHaveBeenCalledWith({
      grantId,
      projectId,
    });
    expect(state.del).not.toHaveBeenCalled();
    expect(state.removeRejectedProjectUploadGrant).not.toHaveBeenCalled();
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

    const onBeforeGenerateToken = getOnBeforeGenerateToken();
    if (!onBeforeGenerateToken) {
      throw new Error("Missing onBeforeGenerateToken.");
    }

    await expect(
      onBeforeGenerateToken(
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

    const onBeforeGenerateToken = getOnBeforeGenerateToken();
    if (!onBeforeGenerateToken) {
      throw new Error("Missing onBeforeGenerateToken.");
    }

    await expect(
      onBeforeGenerateToken(
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

    const onBeforeGenerateToken = getOnBeforeGenerateToken();
    if (!onBeforeGenerateToken) {
      throw new Error("Missing onBeforeGenerateToken.");
    }

    const invalid = [
      `projects/${projectId}/uploads/a/b`,
      `projects/${projectId}/uploads/%2e%2e`,
      `projects/${projectId}/uploads/a%2Fb`,
    ] as const;

    for (const pathname of invalid) {
      await expect(
        onBeforeGenerateToken(pathname, JSON.stringify({ projectId }), false),
      ).rejects.toMatchObject({ code: "bad_request" });
    }
  });
});
