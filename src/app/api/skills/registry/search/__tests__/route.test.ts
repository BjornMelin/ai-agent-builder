import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getProjectByIdForUser: vi.fn(),
  listAvailableSkillsForProject: vi.fn(),
  listProjectSkillsByProject: vi.fn(),
  requireAppUserApi: vi.fn(),
  searchSkillsShRegistry: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: (...args: unknown[]) => state.requireAppUserApi(...args),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/lib/data/project-skills.server", () => ({
  listProjectSkillsByProject: (...args: unknown[]) =>
    state.listProjectSkillsByProject(...args),
}));

vi.mock("@/lib/ai/skills/index.server", () => ({
  listAvailableSkillsForProject: (...args: unknown[]) =>
    state.listAvailableSkillsForProject(...args),
}));

vi.mock("@/lib/skills-registry/skills-sh-search.server", () => ({
  searchSkillsShRegistry: (...args: unknown[]) =>
    state.searchSkillsShRegistry(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/skills/registry/search/route");
  return { GET: mod.GET };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.listProjectSkillsByProject.mockResolvedValue([
    {
      id: "skill_1",
      metadata: {
        registry: {
          id: "vercel-labs/skills/find-skills",
          skillId: "find-skills",
          source: "vercel-labs/skills",
        },
      },
      name: "find-skills",
    },
  ]);
  state.listAvailableSkillsForProject.mockResolvedValue([
    {
      description: "x",
      location: "db:skill_1",
      name: "find-skills",
      source: "db",
    },
  ]);
  state.searchSkillsShRegistry.mockResolvedValue({
    count: 1,
    duration_ms: 1,
    query: "find",
    searchType: "fuzzy",
    skills: [
      {
        id: "vercel-labs/skills/find-skills",
        installs: 123,
        name: "find-skills",
        skillId: "find-skills",
        source: "vercel-labs/skills",
      },
    ],
  });
});

describe("GET /api/skills/registry/search", () => {
  it("annotates registry skills with install state", async () => {
    const { GET } = await loadRoute();
    const res = await GET(
      new Request(
        "http://localhost/api/skills/registry/search?projectId=proj_1&q=find&limit=10",
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      query: "find",
      skills: [
        {
          effectiveSource: "db",
          id: "vercel-labs/skills/find-skills",
          installed: true,
          installedOrigin: "registry",
          installedRegistryId: "vercel-labs/skills/find-skills",
          installedSkillId: "skill_1",
          name: "find-skills",
          source: "vercel-labs/skills",
        },
      ],
    });
  });
});
