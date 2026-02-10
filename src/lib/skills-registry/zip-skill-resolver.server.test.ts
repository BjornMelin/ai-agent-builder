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
});
