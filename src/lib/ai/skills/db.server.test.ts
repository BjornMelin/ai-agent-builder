import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getProjectSkillByName: vi.fn(),
  listProjectSkillsByProject: vi.fn(),
}));

vi.mock("@/lib/data/project-skills.server", () => ({
  getProjectSkillByName: (...args: unknown[]) =>
    state.getProjectSkillByName(...args),
  listProjectSkillsByProject: (...args: unknown[]) =>
    state.listProjectSkillsByProject(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("skills db helpers", () => {
  it("listDatabaseSkills maps DB rows to progressive metadata", async () => {
    state.listProjectSkillsByProject.mockResolvedValueOnce([
      {
        content: "---\nname: sandbox\ndescription: test\n---\n\n# body\n",
        createdAt: "2025-01-01T00:00:00.000Z",
        description: "Sandbox workflow patterns",
        id: "skill_1",
        metadata: {},
        name: "sandbox",
        projectId: "proj_1",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ]);

    const { listDatabaseSkills } = await import("@/lib/ai/skills/db.server");
    await expect(listDatabaseSkills("proj_1")).resolves.toEqual([
      {
        description: "Sandbox workflow patterns",
        location: "db:skill_1",
        name: "sandbox",
        source: "db",
      },
    ]);
  });

  it("loadDatabaseSkillByName returns null for empty names", async () => {
    const { loadDatabaseSkillByName } = await import(
      "@/lib/ai/skills/db.server"
    );
    await expect(loadDatabaseSkillByName("proj_1", "   ")).resolves.toBeNull();
    expect(state.getProjectSkillByName).not.toHaveBeenCalled();
  });

  it("loadDatabaseSkillByName returns null when missing", async () => {
    state.getProjectSkillByName.mockResolvedValueOnce(null);

    const { loadDatabaseSkillByName } = await import(
      "@/lib/ai/skills/db.server"
    );
    await expect(
      loadDatabaseSkillByName("proj_1", "sandbox"),
    ).resolves.toBeNull();
  });

  it("loadDatabaseSkillByName strips frontmatter when found", async () => {
    state.getProjectSkillByName.mockResolvedValueOnce({
      content: "---\nname: sandbox\ndescription: test\n---\n\n# Hello\n",
      createdAt: "2025-01-01T00:00:00.000Z",
      description: "Sandbox workflow patterns",
      id: "skill_1",
      metadata: {},
      name: "Sandbox",
      projectId: "proj_1",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });

    const { loadDatabaseSkillByName } = await import(
      "@/lib/ai/skills/db.server"
    );
    await expect(
      loadDatabaseSkillByName("proj_1", " sandbox "),
    ).resolves.toEqual({
      content: "# Hello",
      description: "Sandbox workflow patterns",
      location: "db:skill_1",
      name: "Sandbox",
    });
  });
});
