import { beforeEach, describe, expect, it, vi } from "vitest";

type OctokitGetResponse = Readonly<{
  data: Readonly<{
    default_branch?: unknown;
    clone_url?: unknown;
    html_url?: unknown;
    owner?: Readonly<{ login?: unknown }> | null;
    name?: unknown;
  }>;
}>;

const state = vi.hoisted(() => ({
  env: {
    github: {
      token: "token",
    },
  },
  octokitCtor: vi.fn(),
  reposGet: vi.fn<(...args: unknown[]) => Promise<OctokitGetResponse>>(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class OctokitMock {
    public repos = {
      get: (...args: unknown[]) => state.reposGet(...args),
    };

    public constructor(...args: unknown[]) {
      state.octokitCtor(...args);
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.env.github.token = "token";
  state.reposGet.mockResolvedValue({
    data: {
      clone_url: "https://example.com/repo.git",
      default_branch: "main",
      html_url: "https://example.com/repo",
      name: "repo",
      owner: { login: "owner" },
    },
  });
});

describe("github client", () => {
  it("isGitHubConfigured requires a non-empty token", async () => {
    const { isGitHubConfigured } = await import(
      "@/lib/repo/github.client.server"
    );

    state.env.github.token = " ";
    expect(isGitHubConfigured()).toBe(false);

    state.env.github.token = "ok";
    expect(isGitHubConfigured()).toBe(true);
  });

  it("getGitHubClient throws when token is missing", async () => {
    state.env.github.token = "";
    const { getGitHubClient } = await import("@/lib/repo/github.client.server");
    expect(() => getGitHubClient()).toThrowError(/GITHUB_TOKEN/);
  });

  it("fetchGitHubRepoInfo validates owner/name", async () => {
    const { fetchGitHubRepoInfo } = await import(
      "@/lib/repo/github.client.server"
    );
    await expect(
      fetchGitHubRepoInfo({ name: "r", owner: " " }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("fetchGitHubRepoInfo normalizes the API response", async () => {
    const { fetchGitHubRepoInfo } = await import(
      "@/lib/repo/github.client.server"
    );

    await expect(
      fetchGitHubRepoInfo({ name: " repo ", owner: " owner " }),
    ).resolves.toEqual({
      cloneUrl: "https://example.com/repo.git",
      defaultBranch: "main",
      htmlUrl: "https://example.com/repo",
      name: "repo",
      owner: "owner",
    });
  });

  it("fetchGitHubRepoInfo throws bad_gateway when required fields are missing", async () => {
    state.reposGet.mockResolvedValueOnce({
      data: {
        clone_url: "",
        default_branch: "main",
        html_url: "https://example.com/repo",
        name: "repo",
        owner: { login: "owner" },
      },
    });

    const { fetchGitHubRepoInfo } = await import(
      "@/lib/repo/github.client.server"
    );

    await expect(
      fetchGitHubRepoInfo({ name: "repo", owner: "owner" }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });
  });
});
