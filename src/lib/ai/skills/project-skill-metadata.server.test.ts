import { describe, expect, it } from "vitest";

import {
  getProjectSkillBundleRef,
  getProjectSkillRegistryRef,
} from "@/lib/ai/skills/project-skill-metadata.server";

describe("project skill metadata parsing", () => {
  it("returns the registry ref when valid", () => {
    const res = getProjectSkillRegistryRef({
      registry: {
        id: "vercel-labs/skills/find-skills",
        skillId: "find-skills",
        source: "vercel-labs/skills",
      },
    });

    expect(res).toEqual({
      id: "vercel-labs/skills/find-skills",
      skillId: "find-skills",
      source: "vercel-labs/skills",
    });
  });

  it("returns null for invalid registry metadata", () => {
    expect(getProjectSkillRegistryRef({ registry: null })).toBeNull();
    expect(getProjectSkillRegistryRef({ registry: { id: "" } })).toBeNull();
  });

  it("returns the bundle ref when valid", () => {
    const res = getProjectSkillBundleRef({
      bundle: {
        blobPath: "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
        fileCount: 3,
        format: "zip-v1",
        sizeBytes: 1234,
      },
    });

    expect(res).toEqual({
      blobPath: "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
      fileCount: 3,
      format: "zip-v1",
      sizeBytes: 1234,
    });
  });

  it("returns null for invalid bundle metadata", () => {
    expect(getProjectSkillBundleRef({ bundle: null })).toBeNull();
    expect(
      getProjectSkillBundleRef({
        bundle: {
          blobPath: "x",
          fileCount: -1,
          format: "zip-v1",
          sizeBytes: 0,
        },
      }),
    ).toBeNull();
  });
});
