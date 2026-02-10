import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  del: vi.fn(),
  deleteProjectSkill: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  getProjectSkillById: vi.fn(),
  listProjectSkillsByProject: vi.fn(),
  requireAppUserApi: vi.fn(),
  upsertProjectSkill: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => state.del(...args),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: (...args: unknown[]) => state.requireAppUserApi(...args),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/lib/data/project-skills.server", () => ({
  deleteProjectSkill: (...args: unknown[]) => state.deleteProjectSkill(...args),
  getProjectSkillById: (...args: unknown[]) =>
    state.getProjectSkillById(...args),
  listProjectSkillsByProject: (...args: unknown[]) =>
    state.listProjectSkillsByProject(...args),
  upsertProjectSkill: (...args: unknown[]) => state.upsertProjectSkill(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/skills/route");
  return { DELETE: mod.DELETE, GET: mod.GET, POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.listProjectSkillsByProject.mockResolvedValue([]);
  state.upsertProjectSkill.mockResolvedValue({
    content: '---\nname: "skills"\ndescription: "x"\n---\n\n# Body\n',
    createdAt: new Date(0).toISOString(),
    description: "x",
    id: "skill_1",
    metadata: {},
    name: "skills",
    projectId: "proj_1",
    updatedAt: new Date(0).toISOString(),
  });
  state.getProjectSkillById.mockResolvedValue(null);
  state.deleteProjectSkill.mockResolvedValue({ ok: true });
  state.del.mockResolvedValue(undefined);
});

describe("GET /api/skills", () => {
  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/skills"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns forbidden when the project is not accessible", async () => {
    const { GET } = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/skills?projectId=proj_1"),
    );
    expect(res.status).toBe(403);
  });

  it("lists skills for the project", async () => {
    const { GET } = await loadRoute();
    state.listProjectSkillsByProject.mockResolvedValueOnce([{ id: "skill_1" }]);

    const res = await GET(
      new Request("http://localhost/api/skills?projectId=proj_1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      skills: [{ id: "skill_1" }],
    });
  });
});

describe("POST /api/skills", () => {
  it("rejects invalid JSON bodies", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/skills", { body: "{", method: "POST" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns forbidden when the project is not accessible", async () => {
    const { POST } = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await POST(
      new Request("http://localhost/api/skills", {
        body: JSON.stringify({
          body: "# Body",
          description: "x",
          name: "skills",
          projectId: "proj_1",
        }),
        method: "POST",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("upserts a project skill and stores a normalized SKILL.md", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/skills", {
        body: JSON.stringify({
          body: "# Instructions",
          description: "desc",
          name: "My Skill",
          projectId: "proj_1",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(state.upsertProjectSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('name: "My Skill"'),
        description: "desc",
        name: "My Skill",
        projectId: "proj_1",
      }),
    );
  });
});

describe("DELETE /api/skills", () => {
  it("rejects invalid JSON bodies", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE(
      new Request("http://localhost/api/skills", {
        body: "{",
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns forbidden when the project is not accessible", async () => {
    const { DELETE } = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await DELETE(
      new Request("http://localhost/api/skills", {
        body: JSON.stringify({ projectId: "proj_1", skillId: "skill_1" }),
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("deletes a project skill", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE(
      new Request("http://localhost/api/skills", {
        body: JSON.stringify({ projectId: "proj_1", skillId: "skill_1" }),
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(200);
    expect(state.deleteProjectSkill).toHaveBeenCalledWith({
      projectId: "proj_1",
      skillId: "skill_1",
    });
  });
});
