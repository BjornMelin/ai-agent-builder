import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listAvailableSkillsForProject: vi.fn(),
  loadSkillForProject: vi.fn(),
  readSkillFileForProject: vi.fn(),
}));

vi.mock("@/lib/ai/skills/index.server", () => ({
  listAvailableSkillsForProject: (...args: unknown[]) =>
    state.listAvailableSkillsForProject(...args),
  loadSkillForProject: (...args: unknown[]) =>
    state.loadSkillForProject(...args),
  readSkillFileForProject: (...args: unknown[]) =>
    state.readSkillFileForProject(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("skills tool steps", () => {
  it("skillsLoadStep validates inputs", async () => {
    const { skillsLoadStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );

    await expect(
      skillsLoadStep({ name: "" }, {
        experimental_context: { projectId: "proj_1" },
      } as unknown as ToolExecutionOptions),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("skillsLoadStep requires a valid project context", async () => {
    const { skillsLoadStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );

    await expect(
      skillsLoadStep({ name: "sandbox" }, {
        experimental_context: null,
      } as unknown as ToolExecutionOptions),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("skillsLoadStep delegates to loadSkillForProject", async () => {
    state.loadSkillForProject.mockResolvedValueOnce({
      content: "# Skill",
      name: "sandbox",
      ok: true,
      skillDirectory: null,
      source: "db",
    });

    const { skillsLoadStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );
    await expect(
      skillsLoadStep({ name: "sandbox" }, {
        experimental_context: { projectId: "proj_1" },
      } as unknown as ToolExecutionOptions),
    ).resolves.toMatchObject({ ok: true, source: "db" });

    expect(state.loadSkillForProject).toHaveBeenCalledWith({
      name: "sandbox",
      projectId: "proj_1",
    });
  });

  it("skillsReadFileStep validates inputs", async () => {
    const { skillsReadFileStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );

    await expect(
      skillsReadFileStep({ name: "sandbox", path: "" }, {
        experimental_context: { projectId: "proj_1" },
      } as unknown as ToolExecutionOptions),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("skillsReadFileStep requires a valid project context", async () => {
    const { skillsReadFileStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );

    await expect(
      skillsReadFileStep({ name: "sandbox", path: "references/example.md" }, {
        experimental_context: null,
      } as unknown as ToolExecutionOptions),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("skillsReadFileStep delegates to readSkillFileForProject", async () => {
    state.readSkillFileForProject.mockResolvedValueOnce({
      content: "hello",
      name: "sandbox",
      ok: true,
      path: "references/example.md",
    });

    const { skillsReadFileStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );
    await expect(
      skillsReadFileStep({ name: "sandbox", path: "references/example.md" }, {
        experimental_context: { projectId: "proj_1" },
      } as unknown as ToolExecutionOptions),
    ).resolves.toEqual({
      content: "hello",
      name: "sandbox",
      ok: true,
      path: "references/example.md",
    });

    expect(state.readSkillFileForProject).toHaveBeenCalledWith({
      name: "sandbox",
      path: "references/example.md",
      projectId: "proj_1",
    });
  });

  it("listProjectSkillsStep delegates to listAvailableSkillsForProject", async () => {
    state.listAvailableSkillsForProject.mockResolvedValueOnce([
      {
        description: "Sandbox patterns",
        location: "db:skill_1",
        name: "sandbox",
        source: "db",
      },
    ]);

    const { listProjectSkillsStep } = await import(
      "@/workflows/chat/steps/skills.step"
    );
    await expect(
      listProjectSkillsStep({ projectId: "proj_1" }),
    ).resolves.toHaveLength(1);
    expect(state.listAvailableSkillsForProject).toHaveBeenCalledWith("proj_1");
  });
});
