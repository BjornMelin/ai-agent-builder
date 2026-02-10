import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { resolveRegistrySkillFromRepoZip } from "@/lib/skills-registry/zip-skill-resolver.server";

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
});
