import { describe, expect, it, vi } from "vitest";

type EnvOverrides = Readonly<Record<string, string | undefined>>;

async function withEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

const octokitState = vi.hoisted(() => ({
  checksListForRef: vi.fn(),
  pullsCreate: vi.fn(),
  pullsList: vi.fn(),
  pullsMerge: vi.fn(),
  reposGetCombinedStatusForRef: vi.fn(),
}));

class FakeOctokit {
  public pulls = {
    create: octokitState.pullsCreate,
    list: octokitState.pullsList,
    merge: octokitState.pullsMerge,
  };

  public checks = {
    listForRef: octokitState.checksListForRef,
  };

  public repos = {
    getCombinedStatusForRef: octokitState.reposGetCombinedStatusForRef,
  };
}

vi.mock("@octokit/rest", () => ({
  Octokit: FakeOctokit,
}));

async function loadRepoOps() {
  vi.resetModules();
  return await import("@/lib/repo/repo-ops.server");
}

describe("repo-ops", () => {
  it("ensureRunBranchName returns stable agent branch name", async () => {
    const mod = await loadRepoOps();
    expect(
      mod.ensureRunBranchName({ projectSlug: "my-proj", runId: "run_123" }),
    ).toBe("agent/my-proj/run_123");
  });

  it("ensureRunBranchName rejects invalid slugs", async () => {
    const mod = await loadRepoOps();
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "Bad Slug", runId: "run_1" }),
    ).toThrow(/project slug/i);
  });

  it("createOrGetPullRequest returns an existing open PR when present", async () => {
    octokitState.pullsList.mockResolvedValueOnce({
      data: [
        {
          base: { ref: "main" },
          head: { ref: "agent/branch" },
          html_url: "https://github.com/acme/repo/pull/1",
          number: 1,
          state: "open",
          title: "PR",
        },
      ],
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      const pr = await mod.createOrGetPullRequest({
        base: "main",
        body: "body",
        head: "agent/branch",
        owner: "acme",
        repo: "repo",
        title: "PR",
      });

      expect(pr.number).toBe(1);
      expect(octokitState.pullsCreate).not.toHaveBeenCalled();
    });
  });

  it("createOrGetPullRequest creates a PR when none exists", async () => {
    octokitState.pullsList.mockResolvedValueOnce({ data: [] });
    octokitState.pullsCreate.mockResolvedValueOnce({
      data: {
        base: { ref: "main" },
        head: { ref: "agent/branch" },
        html_url: "https://github.com/acme/repo/pull/2",
        number: 2,
        state: "open",
        title: "PR",
      },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      const pr = await mod.createOrGetPullRequest({
        base: "main",
        body: "body",
        head: "agent/branch",
        owner: "acme",
        repo: "repo",
        title: "PR",
      });

      expect(pr.number).toBe(2);
      expect(octokitState.pullsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          base: "main",
          head: "agent/branch",
          owner: "acme",
          repo: "repo",
        }),
      );
    });
  });

  it("pollChecks combines check-runs and commit statuses", async () => {
    octokitState.checksListForRef.mockResolvedValueOnce({
      data: {
        check_runs: [
          {
            conclusion: "success",
            details_url: "https://ci.example/check/1",
            id: 1,
            name: "build",
            status: "completed",
          },
        ],
      },
    });
    octokitState.reposGetCombinedStatusForRef.mockResolvedValueOnce({
      data: {
        statuses: [
          {
            context: "lint",
            description: "ok",
            state: "success",
            target_url: "https://ci.example/status/1",
          },
        ],
      },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      const res = await mod.pollChecks({
        owner: "acme",
        ref: "main",
        repo: "repo",
      });
      expect(res.state).toBe("success");
      expect(res.checkRuns).toHaveLength(1);
      expect(res.statuses).toHaveLength(1);
    });
  });

  it("mergePullRequest requires confirm: true and omits undefined optional fields", async () => {
    octokitState.pullsMerge.mockResolvedValueOnce({
      data: { merged: true, message: "Merged", sha: "sha_1" },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      const result = await mod.mergePullRequest({
        confirm: true,
        owner: "acme",
        pullNumber: 123,
        repo: "repo",
      });

      expect(result.merged).toBe(true);
      expect(octokitState.pullsMerge).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "acme",
          pull_number: 123,
          repo: "repo",
        }),
      );
    });
  });
});
