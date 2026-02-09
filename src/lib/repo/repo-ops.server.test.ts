import { withEnv } from "@tests/utils/env";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensureRunBranchName returns stable agent branch name", async () => {
    const mod = await loadRepoOps();
    expect(
      mod.ensureRunBranchName({ projectSlug: "my-proj", runId: "run_123" }),
    ).toBe("agent/my-proj/run_123");
  });

  it("ensureRunBranchName validates inputs and enforces a length ceiling", async () => {
    const mod = await loadRepoOps();
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "", runId: "run_1" }),
    ).toThrow(/invalid run branch inputs/i);
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "ok", runId: "" }),
    ).toThrow(/invalid run branch inputs/i);
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "ok", runId: "bad space" }),
    ).toThrow(/run id/i);
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "ok", runId: "r".repeat(500) }),
    ).toThrow(/too long/i);
  });

  it("ensureRunBranchName rejects invalid slugs", async () => {
    const mod = await loadRepoOps();
    expect(() =>
      mod.ensureRunBranchName({ projectSlug: "Bad Slug", runId: "run_1" }),
    ).toThrow(/project slug/i);
  });

  it("createOrGetPullRequest validates inputs", async () => {
    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.createOrGetPullRequest({
          base: "main",
          body: "body",
          head: "",
          owner: "acme",
          repo: "repo",
          title: "PR",
        }),
      ).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);
    });
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

  it("createOrGetPullRequest attempts creation when listing fails (and defaults to draft)", async () => {
    octokitState.pullsList.mockRejectedValueOnce(
      Object.assign(new Error("boom"), {
        code: "ETIMEDOUT",
        request: { method: "GET", url: "https://api.github.com/pulls" },
        status: 502,
      }),
    );
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
          draft: true,
        }),
      );
    });
  });

  it("createOrGetPullRequest wraps GitHub create failures", async () => {
    octokitState.pullsList.mockResolvedValueOnce({ data: [] });
    octokitState.pullsCreate.mockRejectedValueOnce(
      Object.assign(new Error("request failed"), {
        request: { method: "POST", url: "https://api.github.com/pulls" },
        status: 500,
      }),
    );

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.createOrGetPullRequest({
          base: "main",
          body: "body",
          draft: false,
          head: "agent/branch",
          owner: "acme",
          repo: "repo",
          title: "PR",
        }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("createOrGetPullRequest throws when required PR fields are missing", async () => {
    octokitState.pullsList.mockResolvedValueOnce({ data: [] });
    octokitState.pullsCreate.mockResolvedValueOnce({
      data: {
        base: { ref: "main" },
        head: { ref: "agent/branch" },
        // html_url missing
        number: 2,
        state: "open",
        title: "PR",
      },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.createOrGetPullRequest({
          base: "main",
          body: "body",
          head: "agent/branch",
          owner: "acme",
          repo: "repo",
          title: "PR",
        }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("createOrGetPullRequest normalizes state to closed", async () => {
    octokitState.pullsList.mockResolvedValueOnce({
      data: [
        {
          base: { ref: "main" },
          head: { ref: "agent/branch" },
          html_url: "https://github.com/acme/repo/pull/1",
          number: 1,
          state: "closed",
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
      expect(pr.state).toBe("closed");
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

  it("pollChecks computes pending and failure states across multiple check outcomes", async () => {
    octokitState.checksListForRef.mockResolvedValueOnce({
      data: {
        check_runs: [
          // filtered out (missing id)
          { name: "bad" },
          // queued defaults
          { conclusion: "", id: 1, name: "", status: "unknown" },
          // in_progress
          {
            conclusion: null,
            id: 2,
            name: "in-progress",
            status: "in_progress",
          },
          // completed with many conclusions
          {
            conclusion: "success",
            details_url: "",
            id: 3,
            name: "ok",
            status: "completed",
          },
          { conclusion: "neutral", id: 4, status: "completed" },
          { conclusion: "skipped", id: 5, status: "completed" },
          { conclusion: "cancelled", id: 6, status: "completed" },
          { conclusion: "timed_out", id: 7, status: "completed" },
          { conclusion: "action_required", id: 8, status: "completed" },
          { conclusion: "stale", id: 9, status: "completed" },
          // unknown conclusion => failure
          { conclusion: "nope", id: 10, status: "completed" },
        ],
      },
    });
    octokitState.reposGetCombinedStatusForRef.mockResolvedValueOnce({
      data: {
        statuses: [
          // non-object filtered out
          "bad",
          // pending makes overall pending unless failure occurs
          { context: "ci", description: "", state: "pending", target_url: "" },
          // error makes overall failure
          {
            context: "lint",
            description: "x",
            state: "error",
            target_url: "https://x",
          },
        ],
      },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      const res = await mod.pollChecks({
        owner: "acme",
        ref: "sha",
        repo: "repo",
      });
      expect(res.state).toBe("failure");
      expect(res.checkRuns.length).toBeGreaterThan(0);
      expect(res.statuses.length).toBe(2);
      // Name fallback uses check_<id> when missing.
      expect(res.checkRuns.some((r) => r.name === "check_4")).toBe(true);
    });
  });

  it("pollChecks wraps errors when required status fields are missing", async () => {
    octokitState.checksListForRef.mockResolvedValueOnce({
      data: { check_runs: [] },
    });
    octokitState.reposGetCombinedStatusForRef.mockResolvedValueOnce({
      data: { statuses: [{}] },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.pollChecks({ owner: "acme", ref: "sha", repo: "repo" }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });

  it("pollChecks validates inputs", async () => {
    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.pollChecks({ owner: "", ref: "sha", repo: "repo" }),
      ).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);
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

  it("mergePullRequest validates inputs and requires explicit confirmation", async () => {
    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.mergePullRequest({
          // @ts-expect-error - intentionally invalid
          confirm: false,
          owner: "acme",
          pullNumber: 1,
          repo: "repo",
        }),
      ).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);

      await expect(
        mod.mergePullRequest({
          confirm: true,
          owner: "acme",
          pullNumber: 0,
          repo: "repo",
        }),
      ).rejects.toMatchObject({
        code: "bad_request",
        status: 400,
      } satisfies Partial<AppError>);
    });
  });

  it("mergePullRequest throws conflict when GitHub reports not merged", async () => {
    octokitState.pullsMerge.mockResolvedValueOnce({
      data: { merged: false, message: "Nope", sha: "" },
    });

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.mergePullRequest({
          confirm: true,
          mergeMethod: "squash",
          owner: "acme",
          pullNumber: 123,
          repo: "repo",
        }),
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      } satisfies Partial<AppError>);
    });
  });

  it("mergePullRequest wraps non-AppError failures as bad_gateway", async () => {
    octokitState.pullsMerge.mockRejectedValueOnce(
      Object.assign(new Error("boom"), {
        code: "ETIMEDOUT",
        status: 502,
      }),
    );

    await withEnv({ GITHUB_TOKEN: "ghp_test_token" }, async () => {
      const mod = await loadRepoOps();
      await expect(
        mod.mergePullRequest({
          commitMessage: "msg",
          commitTitle: "title",
          confirm: true,
          expectedHeadSha: "deadbeef",
          mergeMethod: "rebase",
          owner: "acme",
          pullNumber: 123,
          repo: "repo",
        }),
      ).rejects.toMatchObject({
        code: "bad_gateway",
        status: 502,
      } satisfies Partial<AppError>);
    });
  });
});
