import { describe, expect, it } from "vitest";

import {
  tagArtifactsIndex,
  tagModelCatalog,
  tagProject,
  tagProjectsIndex,
  tagUploadsIndex,
} from "@/lib/cache/tags";

describe("cache tags", () => {
  it("builds deterministic project tags", () => {
    expect(tagProjectsIndex("USER_1")).toBe("aab:projects:index:user_1");
    expect(tagProject("PROJECT_1")).toBe("aab:project:project_1");
  });

  it("builds deterministic project-resource tags", () => {
    expect(tagArtifactsIndex("PROJECT_1")).toBe(
      "aab:artifacts:index:project_1",
    );
    expect(tagUploadsIndex("PROJECT_1")).toBe("aab:uploads:index:project_1");
  });

  it("builds deterministic model catalog tag", () => {
    expect(tagModelCatalog()).toBe("aab:models:catalog");
  });
});
