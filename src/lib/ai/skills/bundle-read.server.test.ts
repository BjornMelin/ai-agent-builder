import { withEnv } from "@tests/utils/env";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  head: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  head: (...args: unknown[]) => state.head(...args),
}));

vi.mock("@/lib/net/fetch-with-timeout.server", () => ({
  fetchWithTimeout: (...args: unknown[]) => state.fetchWithTimeout(...args),
}));

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/ai/skills/bundle-read.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("readBundledSkillFileFromBlob", () => {
  it("downloads a bundle zip and returns the requested file content", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", "---\nname: sandbox\ndescription: test\n---\n");
    zip.file("references/example.md", "hello\n");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.head.mockResolvedValueOnce({
        downloadUrl: "https://blob.example/bundle.zip",
        size: zipBytes.byteLength,
      });
      state.fetchWithTimeout.mockResolvedValueOnce({
        arrayBuffer: async () => toArrayBuffer(zipBytes),
        ok: true,
        status: 200,
      });

      const mod = await loadModule();
      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath:
            "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
          relativePath: "references/example.md",
        }),
      ).resolves.toBe("hello\n");

      expect(state.head).toHaveBeenCalledWith(
        "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
        expect.objectContaining({ token: "rw_token" }),
      );
      expect(state.fetchWithTimeout).toHaveBeenCalledWith(
        "https://blob.example/bundle.zip",
        { method: "GET" },
        expect.objectContaining({ timeoutMs: 60_000 }),
      );
    });
  });

  it("rejects absolute and traversal paths", async () => {
    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      const mod = await loadModule();

      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "/etc/passwd",
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "../secret.txt",
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    });
  });

  it("throws when the bundle is too large", async () => {
    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.head.mockResolvedValueOnce({
        downloadUrl: "https://blob.example/bundle.zip",
        size: 5_000_001,
      });

      const mod = await loadModule();
      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "SKILL.md",
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    });
  });

  it("throws when the download fails", async () => {
    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.head.mockResolvedValueOnce({
        downloadUrl: "https://blob.example/bundle.zip",
        size: 123,
      });
      state.fetchWithTimeout.mockResolvedValueOnce({
        ok: false,
        status: 502,
      });

      const mod = await loadModule();
      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "SKILL.md",
        }),
      ).rejects.toMatchObject({
        code: "upstream_failed",
        status: 502,
      });
    });
  });

  it("throws not_found when the requested file is missing", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", "---\nname: sandbox\ndescription: test\n---\n");
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.head.mockResolvedValueOnce({
        downloadUrl: "https://blob.example/bundle.zip",
        size: zipBytes.byteLength,
      });
      state.fetchWithTimeout.mockResolvedValueOnce({
        arrayBuffer: async () => toArrayBuffer(zipBytes),
        ok: true,
        status: 200,
      });

      const mod = await loadModule();
      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "references/missing.md",
        }),
      ).rejects.toMatchObject({ code: "not_found", status: 404 });
    });
  });

  it("rejects binary files", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", "---\nname: sandbox\ndescription: test\n---\n");
    zip.file("bin.dat", new Uint8Array([0, 1, 2]));
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      state.head.mockResolvedValueOnce({
        downloadUrl: "https://blob.example/bundle.zip",
        size: zipBytes.byteLength,
      });
      state.fetchWithTimeout.mockResolvedValueOnce({
        arrayBuffer: async () => toArrayBuffer(zipBytes),
        ok: true,
        status: 200,
      });

      const mod = await loadModule();
      await expect(
        mod.readBundledSkillFileFromBlob({
          blobPath: "bundle",
          relativePath: "bin.dat",
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    });
  });
});
