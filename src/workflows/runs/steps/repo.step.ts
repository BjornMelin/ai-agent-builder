import "server-only";

import type {
  RepoChecksPollResult,
  RepoPullRequestMergeResult,
} from "@/lib/repo/repo-ops.server";
import { mergePullRequest, pollChecks } from "@/lib/repo/repo-ops.server";

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * GitHub checks poll result with bounded waiting.
 */
export type RepoChecksWaitResult = Readonly<{
  kind: "terminal" | "timeout";
  waitedMs: number;
  pollCount: number;
  last: RepoChecksPollResult;
}>;

/**
 * Poll GitHub checks and commit statuses for a ref.
 *
 * @remarks
 * Read-only operation (no side effects). Wrapped in a Workflow DevKit step to
 * cache results during deterministic replays.
 *
 * @param input - Repo identity and ref (branch or commit SHA).
 * @returns Poll result.
 */
export async function pollGitHubChecksStep(
  input: Readonly<{ owner: string; repo: string; ref: string }>,
): Promise<RepoChecksPollResult> {
  "use step";

  return await pollChecks(input);
}

/**
 * Poll GitHub checks until they reach a terminal state (success/failure), or timeout.
 *
 * @remarks
 * This is a read-only operation. It does not mutate GitHub state.
 *
 * @param input - Repo identity and ref plus polling budget.
 * @returns Terminal or timeout wait result.
 */
export async function pollGitHubChecksUntilTerminalStep(
  input: Readonly<{
    owner: string;
    repo: string;
    ref: string;
    timeoutMs?: number;
    intervalMs?: number;
  }>,
): Promise<RepoChecksWaitResult> {
  "use step";

  const timeoutMs = Math.min(
    Math.max(input.timeoutMs ?? 5 * 60_000, 1),
    30 * 60_000,
  );
  const intervalMs = Math.min(Math.max(input.intervalMs ?? 2_000, 0), 30_000);

  const startedAt = Date.now();
  let pollCount = 0;
  let last = await pollChecks({
    owner: input.owner,
    ref: input.ref,
    repo: input.repo,
  });
  pollCount += 1;

  while (Date.now() - startedAt < timeoutMs && last.state === "pending") {
    await sleepMs(intervalMs);
    last = await pollChecks({
      owner: input.owner,
      ref: input.ref,
      repo: input.repo,
    });
    pollCount += 1;
  }

  const waitedMs = Date.now() - startedAt;
  if (last.state !== "pending") {
    return { kind: "terminal", last, pollCount, waitedMs };
  }

  return { kind: "timeout", last, pollCount, waitedMs };
}

/**
 * Merge a GitHub pull request (approval-gated by the workflow).
 *
 * @remarks
 * Side-effectful. The workflow MUST call this only after a matching approval
 * gate has been approved (FR-031).
 *
 * @param input - Merge inputs.
 * @returns Merge result.
 */
export async function mergeGitHubPullRequestStep(
  input: Readonly<{
    owner: string;
    repo: string;
    pullNumber: number;
    mergeMethod?: "merge" | "squash" | "rebase";
    commitTitle?: string;
    commitMessage?: string;
    expectedHeadSha?: string;
  }>,
): Promise<RepoPullRequestMergeResult> {
  "use step";

  return await mergePullRequest({
    confirm: true,
    owner: input.owner,
    pullNumber: input.pullNumber,
    repo: input.repo,
    ...(input.mergeMethod === undefined
      ? {}
      : { mergeMethod: input.mergeMethod }),
    ...(input.commitTitle === undefined
      ? {}
      : { commitTitle: input.commitTitle }),
    ...(input.commitMessage === undefined
      ? {}
      : { commitMessage: input.commitMessage }),
    ...(input.expectedHeadSha === undefined
      ? {}
      : { expectedHeadSha: input.expectedHeadSha }),
  });
}
