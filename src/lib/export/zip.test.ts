import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import {
  buildExportZipBytes,
  buildExportZipStream,
} from "@/lib/export/zip.server";

async function streamToBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}

describe("buildExportZipBytes", () => {
  it("produces identical ZIP bytes for identical inputs (ordering-independent)", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const filesA = [
      {
        contentBytes: new TextEncoder().encode("alpha\n"),
        path: "artifacts/PRD/PRD.v1.md",
      },
      {
        contentBytes: new TextEncoder().encode("beta\n"),
        path: "citations/PRD/PRD.v1.json",
      },
    ] as const;

    const filesB = [...filesA].reverse();

    const a = await buildExportZipBytes({ files: filesA, project });
    const b = await buildExportZipBytes({ files: filesB, project });

    expect(sha256Hex(a.bytes)).toBe(sha256Hex(b.bytes));
  });

  it("sanitizes zip entry paths to prevent traversal and absolute paths", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const files = [
      {
        contentBytes: new TextEncoder().encode("evil\n"),
        path: "artifacts/../evil.txt",
      },
      {
        contentBytes: new TextEncoder().encode("ok\n"),
        path: "citations/./ok.json",
      },
      {
        contentBytes: new TextEncoder().encode("win\n"),
        path: "C:\\temp\\win.txt",
      },
      {
        contentBytes: new TextEncoder().encode("abs\n"),
        path: "/absolute/path.txt",
      },
    ] as const;

    const res = await buildExportZipBytes({ files, project });

    const { default: JSZip } = await import("jszip");
    const zip = await new JSZip().loadAsync(res.bytes);

    const entryNames = Object.keys(zip.files).filter((name) => {
      const obj = zip.files[name];
      return obj ? obj.dir !== true : false;
    });

    for (const name of entryNames) {
      expect(name.startsWith("/")).toBe(false);
      expect(name.includes("\\")).toBe(false);
      expect(/^[a-zA-Z]:/.test(name)).toBe(false);

      const segments = name.split("/");
      expect(segments).not.toContain(".");
      expect(segments).not.toContain("..");
    }

    expect(zip.file("artifacts/_dotdot/evil.txt")).toBeTruthy();
    expect(zip.file("citations/_dot/ok.json")).toBeTruthy();
    expect(zip.file("temp/win.txt")).toBeTruthy();
    expect(zip.file("absolute/path.txt")).toBeTruthy();
    expect(zip.file("manifest.json")).toBeTruthy();
  });

  it("builds the manifest from sanitized zip paths (manifest matches entries)", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const files = [
      {
        contentBytes: new TextEncoder().encode("alpha\n"),
        path: "artifacts/../alpha.txt",
      },
      {
        contentBytes: new TextEncoder().encode("beta\n"),
        path: "citations/./beta.json",
      },
    ] as const;

    const res = await buildExportZipBytes({ files, project });

    const { default: JSZip } = await import("jszip");
    const zip = await new JSZip().loadAsync(res.bytes);

    const manifestRaw = await zip.file("manifest.json")?.async("string");
    expect(manifestRaw).toBeTruthy();

    const manifest = JSON.parse(manifestRaw ?? "null") as unknown;
    expect(manifest).toEqual(res.manifest);

    for (const entry of res.manifest.entries) {
      expect(zip.file(entry.path)).toBeTruthy();
    }
  });

  it("produces identical bytes between byte and stream builders", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const files = [
      {
        contentBytes: new TextEncoder().encode("alpha\n"),
        path: "artifacts/PRD/PRD.v1.md",
      },
      {
        contentBytes: new TextEncoder().encode("beta\n"),
        path: "citations/PRD/PRD.v1.json",
      },
    ] as const;

    const bytesRes = await buildExportZipBytes({ files, project });
    const streamRes = await buildExportZipStream({ files, project });

    const streamBytes = await streamToBytes(streamRes.stream);

    expect(sha256Hex(bytesRes.bytes)).toBe(sha256Hex(streamBytes));
  });

  it("throws when multiple inputs collide to the same sanitized path", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const files = [
      {
        contentBytes: new TextEncoder().encode("a\n"),
        path: "artifacts/a b.txt",
      },
      {
        contentBytes: new TextEncoder().encode("b\n"),
        path: "artifacts/a_b.txt",
      },
    ] as const;

    await expect(
      buildExportZipBytes({ files, project }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
