import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => state.put(...args),
}));

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/skills-registry/skill-bundle-blob.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("project skill bundle blob helpers", () => {
  it("builds the canonical blob path", async () => {
    const mod = await loadModule();
    expect(
      mod.getProjectSkillBundleBlobPath({
        projectId: "p1",
        skillName: "sandbox",
      }),
    ).toBe("projects/p1/skills/sandbox/bundles/skill-bundle.zip");
  });

  it("uploads the bundle zip to Vercel Blob and returns the pathname", async () => {
    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.put.mockResolvedValueOnce({
        pathname: "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
        url: "https://blob.example/zip",
      });

      const mod = await loadModule();
      await expect(
        mod.putProjectSkillBundleBlob({
          blobPath: "projects/p1/skills/sandbox/bundles/skill-bundle.zip",
          bytes: new Uint8Array([1, 2, 3]),
        }),
      ).resolves.toBe(
        "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
      );

      expect(state.put).toHaveBeenCalledWith(
        "projects/p1/skills/sandbox/bundles/skill-bundle.zip",
        expect.any(Buffer),
        expect.objectContaining({
          access: "public",
          addRandomSuffix: true,
          contentType: "application/zip",
          token: "rw_token",
        }),
      );
    });
  });
});
