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
  requireAppUserApi: (...args: unknown[]) => state.requireAppUserApi(...args),
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: (...args: unknown[]) =>
    state.getProjectByIdForUser(...args),
}));

vi.mock("@/lib/data/repos.server", () => ({
  listReposByProject: (...args: unknown[]) => state.listReposByProject(...args),
  upsertRepoConnection: (...args: unknown[]) =>
    state.upsertRepoConnection(...args),
}));

vi.mock("@/lib/repo/github.client.server", () => ({
  fetchGitHubRepoInfo: (...args: unknown[]) =>
    state.fetchGitHubRepoInfo(...args),
  isGitHubConfigured: (...args: unknown[]) => state.isGitHubConfigured(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/repos/route");
  return { GET: mod.GET, POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user_1" });
  state.getProjectByIdForUser.mockResolvedValue({ id: "proj_1" });
  state.listReposByProject.mockResolvedValue([]);
  state.upsertRepoConnection.mockResolvedValue({
    cloneUrl: "https://example.com/repo.git",
    createdAt: new Date(0).toISOString(),
    defaultBranch: "main",
    htmlUrl: "https://example.com/repo",
    id: "repo_1",
    name: "repo",
    owner: "owner",
    projectId: "proj_1",
    provider: "github",
    updatedAt: new Date(0).toISOString(),
  });
  state.isGitHubConfigured.mockReturnValue(false);
  state.fetchGitHubRepoInfo.mockResolvedValue({
    cloneUrl: "https://example.com/repo.git",
    defaultBranch: "main",
    htmlUrl: "https://example.com/repo",
    name: "repo",
    owner: "owner",
  });
});

describe("GET /api/repos", () => {
  it("rejects invalid query params", async () => {
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/repos"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns forbidden when the project is not accessible", async () => {
    const { GET } = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(
      new Request("http://localhost/api/repos?projectId=proj_1"),
    );
    expect(res.status).toBe(403);
  });

  it("lists repos for the project", async () => {
    const { GET } = await loadRoute();
    state.listReposByProject.mockResolvedValueOnce([{ id: "repo_1" }]);

    const res = await GET(
      new Request("http://localhost/api/repos?projectId=proj_1"),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      repos: [{ id: "repo_1" }],
    });
  });
});

describe("POST /api/repos", () => {
  it("rejects invalid JSON bodies", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/repos", { body: "{", method: "POST" }),
    );
    expect(res.status).toBe(400);
  });

  it("requires cloneUrl/htmlUrl/defaultBranch when GitHub API is not configured", async () => {
    const { POST } = await loadRoute();
    state.isGitHubConfigured.mockReturnValueOnce(false);

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          name: "repo",
          owner: "owner",
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

  it("uses GitHub API metadata when configured", async () => {
    const { POST } = await loadRoute();
    state.isGitHubConfigured.mockReturnValueOnce(true);

    const res = await POST(
      new Request("http://localhost/api/repos", {
        body: JSON.stringify({
          name: "repo",
          owner: "owner",
          projectId: "proj_1",
          provider: "github",
        }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(201);
    expect(state.fetchGitHubRepoInfo).toHaveBeenCalledWith({
      name: "repo",
      owner: "owner",
    });
    expect(state.upsertRepoConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        htmlUrl: "https://example.com/repo",
      }),
    );
  });
});
