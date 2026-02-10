import { describe, expect, it } from "vitest";

import { parseSkillsRegistrySkillId } from "@/lib/skills-registry/registry-id.server";

describe("parseSkillsRegistrySkillId", () => {
  it("parses a valid registry id", () => {
    expect(
      parseSkillsRegistrySkillId("vercel-labs/skills/find-skills"),
    ).toEqual({
      id: "vercel-labs/skills/find-skills",
      owner: "vercel-labs",
      repo: "skills",
      skillId: "find-skills",
      source: "vercel-labs/skills",
    });
  });

  it("trims input", () => {
    expect(parseSkillsRegistrySkillId("  a/b/c  ").id).toBe("a/b/c");
  });

  it("throws bad_request for invalid ids", () => {
    expect(() => parseSkillsRegistrySkillId("")).toThrowError();
    expect(() => parseSkillsRegistrySkillId("a/b")).toThrowError();
    expect(() => parseSkillsRegistrySkillId("a/b/c/d")).toThrowError();
    expect(() => parseSkillsRegistrySkillId("a/b/c#")).toThrowError();

    try {
      parseSkillsRegistrySkillId("a/b");
    } catch (err) {
      expect(err).toMatchObject({ code: "bad_request", status: 400 });
    }
  });
});
