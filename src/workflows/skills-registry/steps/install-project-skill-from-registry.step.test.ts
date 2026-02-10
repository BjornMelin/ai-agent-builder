import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  del: vi.fn(),
  downloadGithubRepoZip: vi.fn(),
  error: vi.fn(),
  findProjectSkillByNameUncached: vi.fn(),
  findProjectSkillByRegistryId: vi.fn(),
  putProjectSkillBundleBlob: vi.fn(),
  resolveRegistrySkillFromRepoZip: vi.fn(),
  updateProjectSkillById: vi.fn(),
  upsertProjectSkill: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => state.del(...args),
}));

vi.mock("@/lib/core/log", () => ({
  log: { error: (...args: unknown[]) => state.error(...args) },
}));

vi.mock("@/lib/data/project-skills.server", () => ({
  findProjectSkillByNameUncached: (...args: unknown[]) =>
    state.findProjectSkillByNameUncached(...args),
  findProjectSkillByRegistryId: (...args: unknown[]) =>
    state.findProjectSkillByRegistryId(...args),
  updateProjectSkillById: (...args: unknown[]) =>
    state.updateProjectSkillById(...args),
  upsertProjectSkill: (...args: unknown[]) => state.upsertProjectSkill(...args),
}));

vi.mock("@/lib/skills-registry/github-archive.server", () => ({
  downloadGithubRepoZip: (...args: unknown[]) =>
    state.downloadGithubRepoZip(...args),
}));

vi.mock("@/lib/skills-registry/skill-bundle-blob.server", () => ({
  getProjectSkillBundleBlobPath: (input: {
    projectId: string;
    skillName: string;
  }) =>
    `projects/${input.projectId}/skills/${input.skillName}/bundles/skill-bundle.zip`,
  putProjectSkillBundleBlob: (...args: unknown[]) =>
    state.putProjectSkillBundleBlob(...args),
}));

vi.mock("@/lib/skills-registry/zip-skill-resolver.server", () => ({
  resolveRegistrySkillFromRepoZip: (...args: unknown[]) =>
    state.resolveRegistrySkillFromRepoZip(...args),
}));

async function loadModule() {
  vi.resetModules();
  return await import(
    "@/workflows/skills-registry/steps/install-project-skill-from-registry.step"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.findProjectSkillByNameUncached.mockResolvedValue(null);
  state.findProjectSkillByRegistryId.mockResolvedValue(null);
  state.del.mockResolvedValue(undefined);
});

describe("installProjectSkillFromRegistryStep", () => {
  it("validates input", async () => {
    const mod = await loadModule();
    await expect(
      mod.installProjectSkillFromRegistryStep({
        projectId: "",
        registryId: "",
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("installs a new skill and stores bundle + registry metadata", async () => {
    state.downloadGithubRepoZip.mockResolvedValueOnce({
      branch: "main",
      bytes: new Uint8Array([1]),
    });
    state.resolveRegistrySkillFromRepoZip.mockResolvedValueOnce({
      bundle: { bytes: new Uint8Array([2]), fileCount: 2, sizeBytes: 123 },
      content:
        "---\nname: Find Skills\ndescription: Find skills\n---\n\n# Find\n",
      description: "Find skills",
      name: "Find Skills",
      repoDirectory: "skills/find-skills",
    });
    state.putProjectSkillBundleBlob.mockResolvedValueOnce(
      "projects/proj_1/skills/vercel-labs-skills-find-skills/bundles/skill-bundle.zip-abc123",
    );
    state.upsertProjectSkill.mockResolvedValueOnce({
      content: "# body",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "Find skills",
      id: "skill_1",
      metadata: {},
      name: "Find Skills",
      projectId: "proj_1",
      updatedAt: "2025-01-02T00:00:00.000Z",
    });

    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      const mod = await loadModule();
      const res = await mod.installProjectSkillFromRegistryStep({
        projectId: "proj_1",
        registryId: "vercel-labs/skills/find-skills",
      });

      expect(res).toEqual({
        skill: {
          content: "# body",
          description: "Find skills",
          id: "skill_1",
          name: "Find Skills",
          updatedAt: "2025-01-02T00:00:00.000Z",
        },
      });

      expect(state.putProjectSkillBundleBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          blobPath:
            "projects/proj_1/skills/vercel-labs-skills-find-skills/bundles/skill-bundle.zip",
        }),
      );

      expect(state.upsertProjectSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            bundle: expect.objectContaining({
              blobPath:
                "projects/proj_1/skills/vercel-labs-skills-find-skills/bundles/skill-bundle.zip-abc123",
              fileCount: 2,
              format: "zip-v1",
              sizeBytes: 123,
            }),
            registry: expect.objectContaining({
              id: "vercel-labs/skills/find-skills",
              skillId: "find-skills",
              source: "vercel-labs/skills",
            }),
          }),
          name: "Find Skills",
          projectId: "proj_1",
        }),
      );
    });

    expect(state.del).not.toHaveBeenCalled();
  });

  it("best-effort deletes the previous bundle when it changes", async () => {
    state.downloadGithubRepoZip.mockResolvedValueOnce({
      branch: "main",
      bytes: new Uint8Array([1]),
    });
    state.resolveRegistrySkillFromRepoZip.mockResolvedValueOnce({
      bundle: { bytes: new Uint8Array([2]), fileCount: 2, sizeBytes: 123 },
      content:
        "---\nname: Find Skills\ndescription: Find skills\n---\n\n# Find\n",
      description: "Find skills",
      name: "Find Skills",
      repoDirectory: "skills/find-skills",
    });
    state.findProjectSkillByRegistryId.mockResolvedValueOnce({
      content: "---\nname: Find Skills\ndescription: Find skills\n---\n",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "Find skills",
      id: "skill_prev",
      metadata: {
        bundle: {
          blobPath: "old-bundle.zip",
          fileCount: 1,
          format: "zip-v1",
          sizeBytes: 1,
        },
        registry: {
          id: "vercel-labs/skills/find-skills",
          skillId: "find-skills",
          source: "vercel-labs/skills",
        },
      },
      name: "Find Skills",
      projectId: "proj_1",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    state.putProjectSkillBundleBlob.mockResolvedValueOnce("new-bundle.zip");
    state.updateProjectSkillById.mockResolvedValueOnce({
      content: "# body",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "Find skills",
      id: "skill_1",
      metadata: {},
      name: "Find Skills",
      projectId: "proj_1",
      updatedAt: "2025-01-02T00:00:00.000Z",
    });

    state.del.mockRejectedValueOnce(new Error("boom"));

    await withEnv({ BLOB_READ_WRITE_TOKEN: "rw_token" }, async () => {
      const mod = await loadModule();
      await mod.installProjectSkillFromRegistryStep({
        projectId: "proj_1",
        registryId: "vercel-labs/skills/find-skills",
      });
    });

    expect(state.del).toHaveBeenCalledWith("old-bundle.zip", {
      token: "rw_token",
    });
    expect(state.error).toHaveBeenCalledWith(
      "project_skill_bundle_delete_failed",
      expect.any(Object),
    );
  });
});
