import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { resolveRegistrySkillFromRepoZip } from "@/lib/skills-registry/zip-skill-resolver.server";

function skillMd(
  name: string,
  description: string,
  body = "# Skill\n",
): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    body,
  ].join("\n");
}

function setZipFileUncompressedSize(
  zipBytes: Uint8Array,
  fileName: string,
  newSize: number,
): Uint8Array {
  const bytes = new Uint8Array(zipBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const encoder = new TextEncoder();
  const fileNameBytes = encoder.encode(fileName);

  const LOCAL_FILE_HEADER_SIG = 0x04034b50;
  const CENTRAL_DIR_HEADER_SIG = 0x02014b50;

  const writeU32 = (offset: number, value: number) => {
    view.setUint32(offset, value >>> 0, true);
  };

  const findMatch = (
    signature: number,
    nameOffsetFromSig: number,
    nameLenOffsetFromSig: number,
    extraLenOffsetFromSig: number,
    commentLenOffsetFromSig: number | null,
    patchOffsetFromSig: number,
  ) => {
    for (let i = 0; i + 4 <= bytes.byteLength; i += 1) {
      if (view.getUint32(i, true) !== signature) continue;

      const nameLen = view.getUint16(i + nameLenOffsetFromSig, true);
      const extraLen = view.getUint16(i + extraLenOffsetFromSig, true);
      const commentLen =
        commentLenOffsetFromSig === null
          ? 0
          : view.getUint16(i + commentLenOffsetFromSig, true);

      const nameStart = i + nameOffsetFromSig;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > bytes.byteLength) continue;

      const candidate = bytes.subarray(nameStart, nameEnd);
      if (candidate.byteLength !== fileNameBytes.byteLength) continue;
      let matches = true;
      for (let j = 0; j < candidate.byteLength; j += 1) {
        if (candidate[j] !== fileNameBytes[j]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // Patch the uncompressed size field for this header.
      writeU32(i + patchOffsetFromSig, newSize);

      // Skip past variable-length fields to avoid O(n^2) on large zips.
      i = nameEnd + extraLen + commentLen - 1;
    }
  };

  // Local file header:
  // - filename starts at offset 30
  // - file name length at 26, extra length at 28
  // - uncompressed size field at offset 22
  findMatch(LOCAL_FILE_HEADER_SIG, 30, 26, 28, null, 22);

  // Central directory header:
  // - filename starts at offset 46
  // - file name length at 28, extra length at 30, comment length at 32
  // - uncompressed size field at offset 24
  findMatch(CENTRAL_DIR_HEADER_SIG, 46, 28, 30, 32, 24);

  return bytes;
}

describe("resolveRegistrySkillFromRepoZip", () => {
  it("resolves a skill by frontmatter name and bundles its files", async () => {
    const zip = new JSZip();
    zip.file(
      "repo-main/skills/find-skills/SKILL.md",
      [
        "---",
        "name: find-skills",
        "description: Find skills",
        "---",
        "",
        "# Find Skills",
        "",
      ].join("\n"),
    );
    zip.file(
      "repo-main/skills/find-skills/references/example.md",
      "hello world\n",
    );

    const bytes = await zip.generateAsync({ type: "uint8array" });
    const resolved = await resolveRegistrySkillFromRepoZip({
      skillId: "find-skills",
      zipBytes: bytes,
    });

    expect(resolved.name).toBe("find-skills");
    expect(resolved.description).toBe("Find skills");
    expect(resolved.repoDirectory).toBe("skills/find-skills");
    expect(resolved.content).toContain("# Find Skills");
    expect(resolved.bundle.fileCount).toBe(2);
    expect(resolved.bundle.sizeBytes).toBeGreaterThan(0);

    const bundleZip = await JSZip.loadAsync(resolved.bundle.bytes);
    const bundled = Object.keys(bundleZip.files).filter(
      (k) => !bundleZip.files[k]?.dir,
    );
    expect(bundled).toContain("SKILL.md");
    expect(bundled).toContain("references/example.md");
    const example = bundleZip.file("references/example.md");
    expect(example).toBeTruthy();
    if (!example) {
      throw new Error("Expected references/example.md to exist in the bundle.");
    }
    const content = await example.async("string");
    expect(content).toBe("hello world\n");
  });

  it("falls back to matching by directory name when frontmatter name differs", async () => {
    const zip = new JSZip();
    zip.file("a/skills/find-skills/SKILL.md", skillMd("renamed", "x"));
    zip.file("a/skills/find-skills/references/example.md", "hello\n");
    // Add a second root segment to exercise the multi-root prefix selection path.
    zip.file("long-root/README.md", "extra\n");

    const bytes = await zip.generateAsync({ type: "uint8array" });
    const resolved = await resolveRegistrySkillFromRepoZip({
      skillId: "find-skills",
      zipBytes: bytes,
    });

    expect(resolved.repoDirectory).toBe("skills/find-skills");
    expect(resolved.name).toBe("renamed");
    expect(resolved.bundle.fileCount).toBe(2);
  });

  it("throws not_found when the archive is empty", async () => {
    const zip = new JSZip();
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      resolveRegistrySkillFromRepoZip({
        skillId: "find-skills",
        zipBytes: bytes,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws bad_request when the skillId is invalid", async () => {
    const zip = new JSZip();
    zip.file("repo/skills/find-skills/SKILL.md", skillMd("find-skills", "x"));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      resolveRegistrySkillFromRepoZip({ skillId: "   ", zipBytes: bytes }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("throws not_found when the skill directory cannot be determined", async () => {
    const zip = new JSZip();
    zip.file("SKILL.md", skillMd("find-skills", "x"));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      resolveRegistrySkillFromRepoZip({
        skillId: "find-skills",
        zipBytes: bytes,
      }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws bad_request when a bundle file exceeds the max file size", async () => {
    const zip = new JSZip();
    zip.file("repo/skills/find-skills/SKILL.md", skillMd("find-skills", "x"));
    zip.file("repo/skills/find-skills/assets/big.txt", "x".repeat(513_000));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      resolveRegistrySkillFromRepoZip({
        skillId: "find-skills",
        zipBytes: bytes,
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("throws bad_request when the bundle exceeds the max file count", async () => {
    const zip = new JSZip();
    zip.file("repo/skills/find-skills/SKILL.md", skillMd("find-skills", "x"));
    for (let i = 0; i < 250; i += 1) {
      zip.file(`repo/skills/find-skills/references/f-${i}.md`, "x");
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      resolveRegistrySkillFromRepoZip({
        skillId: "find-skills",
        zipBytes: bytes,
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("enforces size caps based on actual decompressed output (even if zip metadata lies)", async () => {
    const zip = new JSZip();
    const big = "x".repeat(513_000);
    zip.file(
      "repo/skills/find-skills/SKILL.md",
      skillMd("find-skills", "x", big),
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });

    // Simulate an archive where the uncompressed size metadata is missing/incorrect.
    const tampered = setZipFileUncompressedSize(
      bytes,
      "repo/skills/find-skills/SKILL.md",
      1,
    );

    await expect(
      resolveRegistrySkillFromRepoZip({
        skillId: "find-skills",
        zipBytes: tampered,
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });
});
