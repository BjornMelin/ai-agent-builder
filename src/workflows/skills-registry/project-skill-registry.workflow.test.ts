import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  installStep: vi.fn(),
}));

vi.mock(
  "@/workflows/skills-registry/steps/install-project-skill-from-registry.step",
  () => ({
    installProjectSkillFromRegistryStep: (...args: unknown[]) =>
      state.installStep(...args),
  }),
);

async function loadWorkflow() {
  vi.resetModules();
  return await import(
    "@/workflows/skills-registry/project-skill-registry.workflow"
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("installProjectSkillFromRegistry workflow", () => {
  it("delegates to the install step", async () => {
    state.installStep.mockResolvedValueOnce({
      skill: {
        content: "# skill",
        description: "desc",
        id: "skill_1",
        name: "sandbox",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    });

    const mod = await loadWorkflow();
    await expect(
      mod.installProjectSkillFromRegistry(
        "proj_1",
        "vercel-labs/skills/sandbox",
      ),
    ).resolves.toMatchObject({ skill: { id: "skill_1" } });

    expect(state.installStep).toHaveBeenCalledWith({
      projectId: "proj_1",
      registryId: "vercel-labs/skills/sandbox",
    });
  });
});
