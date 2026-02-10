import { describe, expect, it } from "vitest";

import {
  parseSkillFrontmatter,
  stripSkillFrontmatter,
} from "@/lib/ai/skills/frontmatter";

describe("skill frontmatter", () => {
  it("parses name and single-line description", () => {
    const content = [
      "---",
      "name: workflow",
      "description: Creates durable workflows.",
      "---",
      "",
      "# Body",
      "",
    ].join("\n");

    expect(parseSkillFrontmatter(content)).toEqual({
      description: "Creates durable workflows.",
      name: "workflow",
    });
  });

  it("parses folded (>) multi-line descriptions", () => {
    const content = [
      "---",
      "name: vercel-sandbox",
      "description: >",
      "  Work with Vercel Sandbox",
      "  in isolated microVMs.",
      "---",
      "",
      "# Body",
      "",
    ].join("\n");

    const fm = parseSkillFrontmatter(content);
    expect(fm.name).toBe("vercel-sandbox");
    expect(fm.description).toBe(
      "Work with Vercel Sandbox in isolated microVMs.",
    );
  });

  it("parses literal (|) multi-line descriptions", () => {
    const content = [
      "---",
      "name: multiline",
      "description: |",
      "  Line 1",
      "  Line 2",
      "---",
      "",
      "# Body",
      "",
    ].join("\n");

    const fm = parseSkillFrontmatter(content);
    expect(fm.name).toBe("multiline");
    expect(fm.description).toBe(["Line 1", "Line 2"].join("\n"));
  });

  it("strips frontmatter and returns the markdown body", () => {
    const content = ["---", "name: x", "description: y", "---", "", "Hi"].join(
      "\n",
    );

    expect(stripSkillFrontmatter(content)).toBe("Hi");
  });
});
