import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => state.put(...args),
}));

async function loadBlobModule() {
  vi.resetModules();
  return await import("@/lib/export/implementation-audit-bundle-blob.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("implementation audit bundle blob", () => {
  it("builds the canonical blob path", async () => {
    const mod = await loadBlobModule();
    expect(
      mod.getImplementationAuditBundleBlobPath({
        projectId: "p1",
        runId: "r1",
      }),
    ).toBe("projects/p1/runs/r1/audit/implementation-audit-bundle.zip");
  });

  it("uploads bytes to Vercel Blob using the configured token", async () => {
    await withEnv({ BLOB_READ_WRITE_TOKEN: "blob_rw_token" }, async () => {
      state.put.mockResolvedValueOnce({
        pathname:
          "projects/p1/runs/r1/audit/implementation-audit-bundle.zip-abc123",
        url: "https://blob.example/file.zip",
      });

      const mod = await loadBlobModule();
      const uploaded = await mod.putImplementationAuditBundleBlob({
        blobPath: "projects/p1/runs/r1/audit/implementation-audit-bundle.zip",
        bytes: new Uint8Array([1, 2, 3]),
      });

      expect(uploaded).toEqual({
        blobPath:
          "projects/p1/runs/r1/audit/implementation-audit-bundle.zip-abc123",
        blobUrl: "https://blob.example/file.zip",
      });
      expect(state.put).toHaveBeenCalledWith(
        "projects/p1/runs/r1/audit/implementation-audit-bundle.zip",
        expect.any(Buffer),
        expect.objectContaining({
          access: "public",
          addRandomSuffix: true,
          contentType: "application/zip",
          token: "blob_rw_token",
        }),
      );
    });
  });
});
