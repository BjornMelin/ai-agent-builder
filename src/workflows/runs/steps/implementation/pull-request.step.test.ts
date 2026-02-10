import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = installImplementationRunHarness();

beforeEach(() => {
  vi.clearAllMocks();
  harness.reset();
});

describe("openImplementationPullRequest", () => {
  it("maps repo-ops PR data to workflow output", async () => {
    const { openImplementationPullRequest } = await import(
      "./pull-request.step"
    );
    await expect(
      openImplementationPullRequest({
        base: "main",
        body: "body",
        head: "agent/project/run_1",
        owner: "owner",
        repo: "repo",
        title: "title",
      }),
    ).resolves.toMatchObject({
      prNumber: 1,
      prUrl: "https://example.com/pr/1",
    });
  });
});
