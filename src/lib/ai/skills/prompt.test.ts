import { describe, expect, it } from "vitest";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import type { SkillMetadata } from "@/lib/ai/skills/types";

function makeSkill(
  input: Readonly<Partial<SkillMetadata> & Pick<SkillMetadata, "name">>,
): SkillMetadata {
  return {
    description: input.description ?? "Example description",
    location: input.location ?? "db:skill_1",
    name: input.name,
    source: input.source ?? "db",
  };
}

describe("buildSkillsPrompt", () => {
  it("returns an empty state when no skills are configured", () => {
    const prompt = buildSkillsPrompt([]);
    expect(prompt).toContain("## Skills");
    expect(prompt).toContain(
      "No agent skills are configured for this project.",
    );
  });

  it("lists skills and truncates long descriptions", () => {
    const prompt = buildSkillsPrompt([
      makeSkill({ description: "x".repeat(260), name: "sandbox" }),
    ]);

    const line = prompt.split("\n").find((l) => l.startsWith("- sandbox:"));
    expect(line).toBeTruthy();
    if (!line) throw new Error("Expected a sandbox entry in the skills list.");
    expect(line.length).toBeLessThanOrEqual(1_000);
    expect(line).toMatch(/\.\.\.$/);
  });

  it("omits skills after the cap and mentions the omitted count", () => {
    const skills = Array.from({ length: 55 }, (_, i) =>
      makeSkill({
        description: `d${i}`,
        location: `db:skill_${i}`,
        name: `skill-${i}`,
      }),
    );

    const prompt = buildSkillsPrompt(skills);
    expect(prompt).toContain("Available skills:");
    expect(prompt).toContain("(5 more omitted)");

    // Ensure only the first 50 are listed.
    expect(prompt).toContain("- skill-0:");
    expect(prompt).toContain("- skill-49:");
    expect(prompt).not.toContain("- skill-50:");
  });

  it("documents how to load and read skill files", () => {
    const prompt = buildSkillsPrompt([makeSkill({ name: "workflow" })]);
    expect(prompt).toContain("Use the `skills.load` tool");
    expect(prompt).toContain("Use `skills.readFile`");
  });
});
