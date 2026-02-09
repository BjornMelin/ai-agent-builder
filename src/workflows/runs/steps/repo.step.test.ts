import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mergePullRequest: vi.fn(),
  pollChecks: vi.fn(),
}));

vi.mock("@/lib/repo/repo-ops.server", () => ({
  mergePullRequest: (...args: unknown[]) => state.mergePullRequest(...args),
  pollChecks: (...args: unknown[]) => state.pollChecks(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("repo workflow steps", () => {
  it("pollGitHubChecksStep returns the pollChecks result", async () => {
    state.pollChecks.mockResolvedValueOnce({ state: "success" });
    const { pollGitHubChecksStep } = await import("./repo.step");
    await expect(
      pollGitHubChecksStep({ owner: "o", ref: "r", repo: "repo" }),
    ).resolves.toEqual({ state: "success" });
  });

  it("pollGitHubChecksUntilTerminalStep returns terminal when checks succeed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    state.pollChecks
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "pending" })
      .mockResolvedValueOnce({ state: "success" });

    const { pollGitHubChecksUntilTerminalStep } = await import("./repo.step");

    const promise = pollGitHubChecksUntilTerminalStep({
      intervalMs: 1_000,
      owner: "o",
      ref: "ref",
      repo: "r",
      timeoutMs: 10_000,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const res = await promise;

    expect(res.kind).toBe("terminal");
    expect(res.last).toEqual({ state: "success" });
    expect(res.pollCount).toBe(3);

    vi.useRealTimers();
  });

  it("pollGitHubChecksUntilTerminalStep returns timeout when checks stay pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    state.pollChecks.mockResolvedValue({ state: "pending" });

    const { pollGitHubChecksUntilTerminalStep } = await import("./repo.step");

    const promise = pollGitHubChecksUntilTerminalStep({
      intervalMs: 1_000,
      owner: "o",
      ref: "ref",
      repo: "r",
      timeoutMs: 2_500,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    const res = await promise;

    expect(res.kind).toBe("timeout");
    expect(res.last).toEqual({ state: "pending" });
    expect(res.pollCount).toBeGreaterThan(1);

    vi.useRealTimers();
  });

  it("mergeGitHubPullRequestStep forwards inputs and enables confirm", async () => {
    state.mergePullRequest.mockResolvedValueOnce({ ok: true });
    const { mergeGitHubPullRequestStep } = await import("./repo.step");

    await expect(
      mergeGitHubPullRequestStep({
        owner: "o",
        pullNumber: 1,
        repo: "r",
      }),
    ).resolves.toEqual({ ok: true });

    expect(state.mergePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm: true,
        owner: "o",
        pullNumber: 1,
        repo: "r",
      }),
    );
  });
});
