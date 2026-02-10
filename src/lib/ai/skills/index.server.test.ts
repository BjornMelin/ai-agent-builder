import { randomUUID } from "node:crypto";
import path from "node:path";
import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  discoverFilesystemSkills: vi.fn(),
  getProjectSkillByName: vi.fn(),
  listDatabaseSkills: vi.fn(),
  loadDatabaseSkillByName: vi.fn(),
  loadFilesystemSkillBody: vi.fn(),
  readBundledSkillFileFromBlob: vi.fn(),
  readFilesystemSkillFile: vi.fn(),
  tagProjectSkillsIndex: vi.fn(
    (projectId: string) => `aab:skills:index:${projectId}`,
  ),
}));

vi.mock("next/cache", () => ({
  cacheLife: (...args: unknown[]) => state.cacheLife(...args),
  cacheTag: (...args: unknown[]) => state.cacheTag(...args),
}));

vi.mock("@/lib/cache/tags", () => ({
  tagProjectSkillsIndex: (projectId: string) =>
    state.tagProjectSkillsIndex(projectId),
}));

vi.mock("@/lib/data/project-skills.server", () => ({
  getProjectSkillByName: (...args: unknown[]) =>
    state.getProjectSkillByName(...args),
}));

vi.mock("@/lib/ai/skills/bundle-read.server", () => ({
  readBundledSkillFileFromBlob: (...args: unknown[]) =>
    state.readBundledSkillFileFromBlob(...args),
}));

vi.mock("@/lib/ai/skills/db.server", () => ({
  listDatabaseSkills: (...args: unknown[]) => state.listDatabaseSkills(...args),
  loadDatabaseSkillByName: (...args: unknown[]) =>
    state.loadDatabaseSkillByName(...args),
}));

vi.mock("@/lib/ai/skills/fs-discovery.server", () => ({
  discoverFilesystemSkills: (...args: unknown[]) =>
    state.discoverFilesystemSkills(...args),
  loadFilesystemSkillBody: (...args: unknown[]) =>
    state.loadFilesystemSkillBody(...args),
  readFilesystemSkillFile: (...args: unknown[]) =>
    state.readFilesystemSkillFile(...args),
}));

async function loadModule() {
  vi.resetModules();
  return await import("@/lib/ai/skills/index.server");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.listDatabaseSkills.mockResolvedValue([]);
  state.discoverFilesystemSkills.mockResolvedValue([]);
  state.loadDatabaseSkillByName.mockResolvedValue(null);
  state.getProjectSkillByName.mockResolvedValue(null);
});

describe("project skills resolution", () => {
  it("listAvailableSkillsForProject merges DB skills first and de-dupes by normalized name", async () => {
    state.listDatabaseSkills.mockResolvedValueOnce([
      {
        description: "Project sandbox skill",
        location: "db:1",
        name: "Sandbox",
        source: "db",
      },
      { description: "ignored", location: "db:2", name: "   ", source: "db" },
    ]);
    state.discoverFilesystemSkills.mockResolvedValueOnce([
      {
        description: "Repo sandbox skill",
        location: "/abs/repo/sandbox",
        name: "sandbox",
        source: "fs",
      },
      {
        description: "Repo workflow skill",
        location: "/abs/repo/workflow",
        name: "Workflow",
        source: "fs",
      },
    ]);

    const mod = await loadModule();
    await expect(mod.listAvailableSkillsForProject("proj_1")).resolves.toEqual([
      {
        description: "Project sandbox skill",
        location: "db:1",
        name: "Sandbox",
        source: "db",
      },
      {
        description: "Repo workflow skill",
        location: "/abs/repo/workflow",
        name: "Workflow",
        source: "fs",
      },
    ]);

    expect(state.cacheTag).toHaveBeenCalledWith("aab:skills:index:proj_1");
  });

  it("throws env_invalid when AGENT_SKILLS_DIRS contains unsupported roots", async () => {
    await withEnv({ AGENT_SKILLS_DIRS: "unknown" }, async () => {
      const mod = await loadModule();
      await expect(
        mod.listAvailableSkillsForProject("proj_1"),
      ).rejects.toMatchObject({
        code: "env_invalid",
        status: 500,
      });
    });
  });

  it("loadSkillForProject validates input names", async () => {
    const mod = await loadModule();
    await expect(
      mod.loadSkillForProject({ name: "   ", projectId: "proj_1" }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("loadSkillForProject returns the database skill when present", async () => {
    state.loadDatabaseSkillByName.mockResolvedValueOnce({
      content: "# DB body",
      description: "DB desc",
      location: "db:1",
      name: "Sandbox",
    });

    const mod = await loadModule();
    await expect(
      mod.loadSkillForProject({ name: " SANDBOX ", projectId: "proj_1" }),
    ).resolves.toEqual({
      content: "# DB body",
      name: "Sandbox",
      ok: true,
      skillDirectory: null,
      source: "db",
    });
  });

  it("loadSkillForProject resolves filesystem skills and returns a repo-relative directory when possible", async () => {
    const skillDir = path.join(process.cwd(), ".agents/skills/sandbox");
    state.discoverFilesystemSkills.mockResolvedValueOnce([
      {
        description: "Repo skill",
        location: skillDir,
        name: "Sandbox",
        source: "fs",
      },
    ]);
    state.loadFilesystemSkillBody.mockResolvedValueOnce("# FS body");

    const mod = await loadModule();
    await expect(
      mod.loadSkillForProject({ name: "sandbox", projectId: "proj_1" }),
    ).resolves.toEqual({
      content: "# FS body",
      name: "Sandbox",
      ok: true,
      skillDirectory: ".agents/skills/sandbox",
      source: "fs",
    });
  });

  it("loadSkillForProject returns a null skillDirectory when the skill is outside the repo", async () => {
    const skillDir = path.join(
      path.dirname(process.cwd()),
      `external-skill-${randomUUID()}`,
    );
    state.discoverFilesystemSkills.mockResolvedValueOnce([
      {
        description: "Repo skill",
        location: skillDir,
        name: "Sandbox",
        source: "fs",
      },
    ]);
    state.loadFilesystemSkillBody.mockResolvedValueOnce("# FS body");

    const mod = await loadModule();
    await expect(
      mod.loadSkillForProject({ name: "sandbox", projectId: "proj_1" }),
    ).resolves.toEqual({
      content: "# FS body",
      name: "Sandbox",
      ok: true,
      skillDirectory: null,
      source: "fs",
    });
  });

  it("loadSkillForProject returns a structured not-found response when missing", async () => {
    const mod = await loadModule();
    await expect(
      mod.loadSkillForProject({ name: "missing", projectId: "proj_1" }),
    ).resolves.toEqual({ error: "Skill 'missing' not found.", ok: false });
  });

  it("readSkillFileForProject returns an error when a DB skill has no bundle metadata", async () => {
    state.getProjectSkillByName.mockResolvedValueOnce({
      content: "---\nname: sandbox\ndescription: test\n---\n",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "desc",
      id: "skill_1",
      metadata: {},
      name: "sandbox",
      projectId: "proj_1",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const mod = await loadModule();
    await expect(
      mod.readSkillFileForProject({
        name: "sandbox",
        path: "references/example.md",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({
      error: "Skill 'sandbox' is project-defined and does not have files.",
      ok: false,
    });
    expect(state.readBundledSkillFileFromBlob).not.toHaveBeenCalled();
  });

  it("readSkillFileForProject reads project-installed skill files from blob bundles", async () => {
    state.getProjectSkillByName.mockResolvedValueOnce({
      content: "---\nname: sandbox\ndescription: test\n---\n",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "desc",
      id: "skill_1",
      metadata: {
        bundle: {
          blobPath:
            "projects/p1/skills/sandbox/bundles/skill-bundle.zip-abc123",
          fileCount: 2,
          format: "zip-v1",
          sizeBytes: 100,
        },
      },
      name: "sandbox",
      projectId: "proj_1",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    state.readBundledSkillFileFromBlob.mockResolvedValueOnce("file contents");

    const mod = await loadModule();
    await expect(
      mod.readSkillFileForProject({
        name: "sandbox",
        path: "references/example.md",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({
      content: "file contents",
      name: "sandbox",
      ok: true,
      path: "references/example.md",
    });
  });

  it("readSkillFileForProject reads repo-bundled filesystem skill files", async () => {
    state.discoverFilesystemSkills.mockResolvedValueOnce([
      {
        description: "Repo skill",
        location: "/abs/repo/sandbox",
        name: "Sandbox",
        source: "fs",
      },
    ]);
    state.readFilesystemSkillFile.mockResolvedValueOnce("repo file");

    const mod = await loadModule();
    await expect(
      mod.readSkillFileForProject({
        name: "sandbox",
        path: "references/example.md",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({
      content: "repo file",
      name: "Sandbox",
      ok: true,
      path: "references/example.md",
    });
  });

  it("readSkillFileForProject validates skill names", async () => {
    const mod = await loadModule();
    await expect(
      mod.readSkillFileForProject({ name: "   ", path: "x", projectId: "p" }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });
});
