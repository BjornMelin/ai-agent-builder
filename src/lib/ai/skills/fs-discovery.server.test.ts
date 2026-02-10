import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverFilesystemSkills,
  loadFilesystemSkillBody,
  readFilesystemSkillFile,
} from "@/lib/ai/skills/fs-discovery.server";

const TEST_TMP_BASE = path.join(process.cwd(), ".tmp", "vitest");

async function makeTempDir(prefix: string): Promise<string> {
  await mkdir(TEST_TMP_BASE, { recursive: true });
  return await mkdtemp(path.join(TEST_TMP_BASE, `${prefix}-`));
}

function skillMd(name: string, description: string, body = "# Body\n"): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    body,
  ].join("\n");
}

describe("filesystem skills discovery", () => {
  it("discovers skills and keeps the first duplicate by root order", async () => {
    const root1 = await makeTempDir("skills-root1");
    const root2 = await makeTempDir("skills-root2");

    try {
      await mkdir(path.join(root1, "a-skill"));
      await writeFile(
        path.join(root1, "a-skill", "SKILL.md"),
        skillMd("sandbox", "First"),
      );

      await mkdir(path.join(root1, "invalid-frontmatter"));
      await writeFile(
        path.join(root1, "invalid-frontmatter", "SKILL.md"),
        "# Missing frontmatter\n",
      );

      await mkdir(path.join(root1, "too-big"));
      await writeFile(
        path.join(root1, "too-big", "SKILL.md"),
        "x".repeat(513_000),
      );

      await mkdir(path.join(root2, "b-skill"));
      await writeFile(
        path.join(root2, "b-skill", "SKILL.md"),
        skillMd("sandbox", "Second"),
      );
      await mkdir(path.join(root2, "c-skill"));
      await writeFile(
        path.join(root2, "c-skill", "SKILL.md"),
        skillMd("workflow", "Third"),
      );

      const skills = await discoverFilesystemSkills([root1, root2]);
      expect(skills).toEqual([
        {
          description: "First",
          location: path.join(root1, "a-skill"),
          name: "sandbox",
          source: "fs",
        },
        {
          description: "Third",
          location: path.join(root2, "c-skill"),
          name: "workflow",
          source: "fs",
        },
      ]);
    } finally {
      await rm(root1, { force: true, recursive: true });
      await rm(root2, { force: true, recursive: true });
    }
  });

  it("skips missing roots without failing", async () => {
    const missingRoot = path.join(
      process.cwd(),
      `.definitely-missing-skills-root-${randomUUID()}`,
    );
    const skills = await discoverFilesystemSkills([missingRoot]);
    expect(skills).toEqual([]);
  });

  it("loads and strips the SKILL.md frontmatter body", async () => {
    const root = await makeTempDir("skills-body");
    const skillDir = path.join(root, "sandbox");

    try {
      await mkdir(skillDir);
      await writeFile(
        path.join(skillDir, "SKILL.md"),
        skillMd("sandbox", "Example", "# Hello\n\nUse this skill.\n"),
      );

      await expect(loadFilesystemSkillBody(skillDir)).resolves.toBe(
        "# Hello\n\nUse this skill.",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reads files with strict relative-path validation and size caps", async () => {
    const root = await makeTempDir("skills-readfile");
    const skillDir = path.join(root, "sandbox");
    const refsDir = path.join(skillDir, "references");

    try {
      await mkdir(refsDir, { recursive: true });
      await writeFile(path.join(skillDir, "SKILL.md"), skillMd("sandbox", "x"));
      await writeFile(path.join(refsDir, "example.md"), "hello\n");

      await expect(
        readFilesystemSkillFile({
          relativePath: "references/example.md",
          skillDirectory: skillDir,
        }),
      ).resolves.toBe("hello\n");

      await expect(
        readFilesystemSkillFile({
          relativePath: ".",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await expect(
        readFilesystemSkillFile({
          relativePath: "references/",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await expect(
        readFilesystemSkillFile({
          relativePath: "references",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await expect(
        readFilesystemSkillFile({
          relativePath: "/etc/passwd",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await expect(
        readFilesystemSkillFile({
          relativePath: "../secret",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });

      await writeFile(path.join(refsDir, "big.txt"), "x".repeat(129_000));
      await expect(
        readFilesystemSkillFile({
          relativePath: "references/big.txt",
          skillDirectory: skillDir,
        }),
      ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
