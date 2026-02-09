import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fetchGitHubRepoInfo: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  isGitHubConfigured: vi.fn(),
  listReposByProject: vi.fn(),
  requireAppUserApi: vi.fn(),
  upsertRepoConnection: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
}));

vi.mock("@/lib/data/repos.server", () => ({
  listReposByProject: state.listReposByProject,
  upsertRepoConnection: state.upsertRepoConnection,
}));

vi.mock("@/lib/repo/github.client.server", () => ({
  fetchGitHubRepoInfo: state.fetchGitHubRepoInfo,
  isGitHubConfigured: state.isGitHubConfigured,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/repos/route");
  return { GET: mod.GET, POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "u" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.listReposByProject.mockResolvedValue([
    {
      cloneUrl: "https://github.com/a/b.git",
      createdAt: new Date().toISOString(),
      defaultBranch: "main",
      htmlUrl: "https://github.com/a/b",
      id: "repo_1",
      name: "b",
      owner: "a",
      projectId: "proj_1",
      provider: "github",
      updatedAt: new Date().toISOString(),
    },
  ]);

  state.upsertRepoConnection.mockResolvedValue({
    cloneUrl: "https://github.com/a/b.git",
    createdAt: new Date().toISOString(),
    defaultBranch: "main",
    htmlUrl: "https://github.com/a/b",
    id: "repo_1",
    name: "b",
    owner: "a",
    projectId: "proj_1",
    provider: "github",
    updatedAt: new Date().toISOString(),
  });

  state.isGitHubConfigured.mockReturnValue(false);
  state.fetchGitHubRepoInfo.mockResolvedValue({
    cloneUrl: "https://github.com/a/b.git",
    defaultBranch: "main",
    htmlUrl: "https://github.com/a/b",
    name: "b",
    owner: "a",
  });
});

describe("GET /api/repos", () => {
  it("requires authentication before listing repos", async () => {
    const { GET } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await GET(
      new Request("http://localhost/api/repos?projectId=proj_1"),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.listReposByProject).not.toHaveBeenCalled();
  });

  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();

    const res = await GET(new Request("http://localhost/api/repos"));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("lists repos for a project", async () => {
    const { GET } = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/repos?projectId=proj_1"),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      repos: [{ id: "repo_1" }],
    });
    expect(state.listReposByProject).toHaveBeenCalledWith("proj_1");
  });
});

describe("POST /api/repos", () => {
  it("requires authentication before connecting repos", async () => {
    const { POST } = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("Unauthorized."));

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          name: "b",
          owner: "a",
          projectId: "proj_1",
          provider: "github",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(state.upsertRepoConnection).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/repos", { body: "{", method: "POST" }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("requires manual fields when GitHub API is not configured", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          name: "b",
          owner: "a",
          projectId: "proj_1",
          provider: "github",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("connects using GitHub API when configured", async () => {
    const { POST } = await loadRoute();
    state.isGitHubConfigured.mockReturnValueOnce(true);

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          name: "b",
          owner: "a",
          projectId: "proj_1",
          provider: "github",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(state.fetchGitHubRepoInfo).toHaveBeenCalledWith({
      name: "b",
      owner: "a",
    });
    expect(state.upsertRepoConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        cloneUrl: "https://github.com/a/b.git",
        defaultBranch: "main",
        htmlUrl: "https://github.com/a/b",
        name: "b",
        owner: "a",
        projectId: "proj_1",
        provider: "github",
      }),
    );
    await expect(res.json()).resolves.toMatchObject({ repo: { id: "repo_1" } });
  });

  it("connects using manual fields when provided", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          cloneUrl: "https://github.com/a/b.git",
          defaultBranch: "main",
          htmlUrl: "https://github.com/a/b",
          name: "b",
          owner: "a",
          projectId: "proj_1",
          provider: "github",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(state.fetchGitHubRepoInfo).not.toHaveBeenCalled();
    expect(state.upsertRepoConnection).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ repo: { id: "repo_1" } });
  });
});
