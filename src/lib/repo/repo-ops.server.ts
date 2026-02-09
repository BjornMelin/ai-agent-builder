import "server-only";

import { Octokit } from "@octokit/rest";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import { env } from "@/lib/env";
import { redactSandboxLog } from "@/lib/sandbox/redaction.server";

/**
 * Minimal pull request shape returned by RepoOps.
 */
export type RepoPullRequest = Readonly<{
  number: number;
  htmlUrl: string;
  title: string;
  state: "open" | "closed";
  headRef: string;
  baseRef: string;
}>;

/**
 * Check rollup state for a ref (commit SHA or branch).
 */
export type RepoChecksState = "success" | "pending" | "failure";

/**
 * Minimal check-run shape returned by {@link pollChecks}.
 */
export type RepoCheckRun = Readonly<{
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion:
    | "success"
    | "failure"
    | "neutral"
    | "cancelled"
    | "timed_out"
    | "action_required"
    | "skipped"
    | "stale"
    | null;
  detailsUrl: string | null;
}>;

/**
 * Minimal commit status context shape returned by {@link pollChecks}.
 */
export type RepoStatusContext = Readonly<{
  context: string;
  state: "success" | "pending" | "failure" | "error";
  targetUrl: string | null;
  description: string | null;
}>;

/**
 * Output from {@link pollChecks}.
 */
export type RepoChecksPollResult = Readonly<{
  ref: string;
  state: RepoChecksState;
  checkRuns: readonly RepoCheckRun[];
  statuses: readonly RepoStatusContext[];
}>;

/**
 * Output from {@link mergePullRequest}.
 */
export type RepoPullRequestMergeResult = Readonly<{
  merged: true;
  message: string;
  sha: string;
}>;

function assertGitHubToken(): string {
  const token = env.github.token;
  if (!token) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "github": missing GITHUB_TOKEN. See docs/ops/env.md.',
    );
  }
  return token;
}

function getOctokit() {
  // Never persist the token; pass it directly to Octokit for request auth.
  // Errors are redacted before logging/throwing (see {@link toSafeGitHubCause}).
  return new Octokit({ auth: assertGitHubToken() });
}

function toRepoPullRequest(
  pr: Readonly<{
    number: number;
    html_url?: string | null;
    title?: string | null;
    state?: string | null;
    head?: { ref?: string | null } | null;
    base?: { ref?: string | null } | null;
  }>,
): RepoPullRequest {
  const htmlUrl = String(pr.html_url ?? "").trim();
  const title = String(pr.title ?? "").trim();
  const stateRaw = String(pr.state ?? "").trim();
  const headRef = String(pr.head?.ref ?? "").trim();
  const baseRef = String(pr.base?.ref ?? "").trim();

  if (!htmlUrl || !title || !headRef || !baseRef) {
    throw new AppError(
      "bad_gateway",
      502,
      "GitHub API response is missing required PR fields.",
    );
  }

  const state: RepoPullRequest["state"] =
    stateRaw === "closed" ? "closed" : "open";

  return {
    baseRef,
    headRef,
    htmlUrl,
    number: pr.number,
    state,
    title,
  };
}

function toSafeGitHubCause(err: unknown): unknown {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      message: redactSandboxLog(err.message || "GitHub request failed."),
      name: err.name,
    };

    if ("status" in err && typeof err.status === "number") {
      out.status = err.status;
    }
    if ("code" in err && typeof err.code === "string") {
      out.code = err.code;
    }

    if ("request" in err && typeof err.request === "object" && err.request) {
      const request = err.request as Record<string, unknown>;
      const method =
        typeof request.method === "string" ? request.method : undefined;
      const url = typeof request.url === "string" ? request.url : undefined;
      if (method || url) {
        out.request = {
          ...(method ? { method } : {}),
          ...(url ? { url } : {}),
        };
      }
    }

    return out;
  }

  if (typeof err === "string") {
    return redactSandboxLog(err);
  }

  return { message: "GitHub request failed." };
}

const PROJECT_SLUG_PATTERN = /^[a-z0-9-]+$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Build and validate the canonical implementation-run branch name.
 *
 * @remarks
 * Implementation runs use the stable naming scheme:
 * `agent/<projectSlug>/<runId>`.
 *
 * @param input - Project slug + run id.
 * @returns Branch name.
 */
export function ensureRunBranchName(
  input: Readonly<{ projectSlug: string; runId: string }>,
): string {
  const projectSlug = input.projectSlug.trim();
  const runId = input.runId.trim();

  if (!projectSlug || !runId) {
    throw new AppError("bad_request", 400, "Invalid run branch inputs.");
  }
  if (!PROJECT_SLUG_PATTERN.test(projectSlug)) {
    throw new AppError("bad_request", 400, "Invalid project slug.");
  }
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new AppError("bad_request", 400, "Invalid run id.");
  }

  const branchName = `agent/${projectSlug}/${runId}`;
  if (branchName.length > 200) {
    throw new AppError("bad_request", 400, "Run branch name is too long.");
  }

  return branchName;
}

/**
 * Create or fetch an existing pull request for a given branch.
 *
 * @remarks
 * This operation is idempotent for `(owner, repo, head, base)` in the sense
 * that it returns an existing open PR when present, and only creates a new PR
 * when none exists.
 *
 * @param input - Pull request creation inputs.
 * @returns Pull request summary.
 */
export async function createOrGetPullRequest(
  input: Readonly<{
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
    draft?: boolean;
  }>,
): Promise<RepoPullRequest> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const head = input.head.trim();
  const base = input.base.trim();
  const title = input.title.trim();
  const body = input.body;

  if (!owner || !repo || !head || !base || !title) {
    throw new AppError("bad_request", 400, "Invalid pull request input.");
  }

  const octokit = getOctokit();

  try {
    const existing = await octokit.pulls.list({
      base,
      head: `${owner}:${head}`,
      owner,
      per_page: 5,
      repo,
      state: "open",
    });

    const first = existing.data.at(0);
    if (first) {
      return toRepoPullRequest(first);
    }
  } catch (err) {
    // Best-effort idempotency check. If listing fails, still attempt creation.
    log.warn("repo_ops_pr_list_failed", {
      error: toSafeGitHubCause(err),
      owner,
      repo,
    });
  }

  try {
    const created = await octokit.pulls.create({
      base,
      body,
      draft: input.draft ?? true,
      head,
      owner,
      repo,
      title,
    });
    return toRepoPullRequest(created.data);
  } catch (err) {
    throw new AppError(
      "bad_gateway",
      502,
      "Failed to create pull request via GitHub.",
      toSafeGitHubCause(err),
    );
  }
}

function toRepoCheckRun(
  run: Readonly<{
    id: number;
    name?: string | null;
    status?: string | null;
    conclusion?: string | null;
    details_url?: string | null;
  }>,
): RepoCheckRun {
  const statusRaw = String(run.status ?? "").trim();
  const status: RepoCheckRun["status"] =
    statusRaw === "completed"
      ? "completed"
      : statusRaw === "in_progress"
        ? "in_progress"
        : "queued";

  const conclusionRaw = String(run.conclusion ?? "").trim();
  const conclusion: RepoCheckRun["conclusion"] =
    conclusionRaw === ""
      ? null
      : conclusionRaw === "success"
        ? "success"
        : conclusionRaw === "neutral"
          ? "neutral"
          : conclusionRaw === "skipped"
            ? "skipped"
            : conclusionRaw === "cancelled"
              ? "cancelled"
              : conclusionRaw === "timed_out"
                ? "timed_out"
                : conclusionRaw === "action_required"
                  ? "action_required"
                  : conclusionRaw === "stale"
                    ? "stale"
                    : "failure";

  const name = String(run.name ?? "").trim() || `check_${run.id}`;
  const detailsUrl = String(run.details_url ?? "").trim();

  return {
    conclusion,
    detailsUrl: detailsUrl.length > 0 ? detailsUrl : null,
    id: run.id,
    name,
    status,
  };
}

function toRepoStatusContext(
  status: Readonly<{
    context?: string | null;
    state?: string | null;
    target_url?: string | null;
    description?: string | null;
  }>,
): RepoStatusContext {
  const context = String(status.context ?? "").trim();
  const stateRaw = String(status.state ?? "").trim();
  const state: RepoStatusContext["state"] =
    stateRaw === "failure"
      ? "failure"
      : stateRaw === "error"
        ? "error"
        : stateRaw === "pending"
          ? "pending"
          : "success";

  const targetUrl = String(status.target_url ?? "").trim();
  const description = String(status.description ?? "").trim();

  if (!context) {
    throw new AppError(
      "bad_gateway",
      502,
      "GitHub API response is missing required status fields.",
    );
  }

  return {
    context,
    description: description.length > 0 ? description : null,
    state,
    targetUrl: targetUrl.length > 0 ? targetUrl : null,
  };
}

function stateFromStatusContexts(statuses: readonly RepoStatusContext[]) {
  let pending = false;
  for (const status of statuses) {
    if (status.state === "failure" || status.state === "error")
      return "failure";
    if (status.state === "pending") pending = true;
  }
  return pending ? "pending" : "success";
}

function stateFromCheckRuns(checkRuns: readonly RepoCheckRun[]) {
  let pending = false;
  for (const run of checkRuns) {
    if (run.status !== "completed") {
      pending = true;
      continue;
    }
    if (run.conclusion === null) {
      pending = true;
      continue;
    }
    if (run.conclusion === "success") continue;
    if (run.conclusion === "neutral") continue;
    if (run.conclusion === "skipped") continue;
    return "failure";
  }
  return pending ? "pending" : "success";
}

function combineChecksState(
  a: RepoChecksState,
  b: RepoChecksState,
): RepoChecksState {
  if (a === "failure" || b === "failure") return "failure";
  if (a === "pending" || b === "pending") return "pending";
  return "success";
}

/**
 * Fetch the current checks + status contexts for a ref.
 *
 * @remarks
 * Read-only operation: it only queries the GitHub API.
 *
 * @param input - Repo identity and ref (branch or commit SHA).
 * @returns Checks rollup + per-check details.
 */
export async function pollChecks(
  input: Readonly<{ owner: string; repo: string; ref: string }>,
): Promise<RepoChecksPollResult> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const ref = input.ref.trim();

  if (!owner || !repo || !ref) {
    throw new AppError("bad_request", 400, "Invalid checks poll input.");
  }

  const octokit = getOctokit();

  try {
    const [checkRunsRes, statusRes] = await Promise.all([
      octokit.checks.listForRef({ owner, per_page: 100, ref, repo }),
      octokit.repos.getCombinedStatusForRef({
        owner,
        per_page: 100,
        ref,
        repo,
      }),
    ]);

    const checkRunsRaw = (
      checkRunsRes.data as Readonly<{ check_runs?: readonly unknown[] }>
    ).check_runs;
    const statusRaw = (
      statusRes.data as Readonly<{ statuses?: readonly unknown[] }>
    ).statuses;

    const checkRuns = (checkRunsRaw ?? [])
      .filter((v): v is Readonly<{ id: number }> => {
        return (
          typeof v === "object" &&
          v !== null &&
          "id" in v &&
          typeof (v as { id?: unknown }).id === "number"
        );
      })
      .map((run) => toRepoCheckRun(run as never));

    const statuses = (statusRaw ?? [])
      .filter((v): v is Record<string, unknown> => {
        return typeof v === "object" && v !== null;
      })
      .map((status) => toRepoStatusContext(status as never));

    const state = combineChecksState(
      stateFromCheckRuns(checkRuns),
      stateFromStatusContexts(statuses),
    );

    return { checkRuns, ref, state, statuses };
  } catch (err) {
    throw new AppError(
      "bad_gateway",
      502,
      "Failed to poll checks via GitHub.",
      toSafeGitHubCause(err),
    );
  }
}

/**
 * Merge a pull request.
 *
 * @remarks
 * Side-effectful operation. The caller is responsible for approval gating
 * (see FR-031). This helper performs the GitHub merge API call only.
 *
 * @param input - Pull request identity and merge options.
 * @returns Merge result.
 */
export async function mergePullRequest(
  input: Readonly<{
    owner: string;
    repo: string;
    pullNumber: number;
    confirm: true;
    mergeMethod?: "merge" | "squash" | "rebase";
    commitTitle?: string;
    commitMessage?: string;
    expectedHeadSha?: string;
  }>,
): Promise<RepoPullRequestMergeResult> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const pullNumber = input.pullNumber;

  if (!owner || !repo || !Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw new AppError("bad_request", 400, "Invalid merge input.");
  }
  if (input.confirm !== true) {
    throw new AppError(
      "bad_request",
      400,
      "Merge requires explicit confirmation.",
    );
  }

  const octokit = getOctokit();

  try {
    const res = await octokit.pulls.merge({
      owner,
      pull_number: pullNumber,
      repo,
      ...(input.commitMessage === undefined
        ? {}
        : { commit_message: input.commitMessage }),
      ...(input.commitTitle === undefined
        ? {}
        : { commit_title: input.commitTitle }),
      ...(input.mergeMethod === undefined
        ? {}
        : { merge_method: input.mergeMethod }),
      ...(input.expectedHeadSha === undefined
        ? {}
        : { sha: input.expectedHeadSha }),
    });

    const merged = Boolean((res.data as { merged?: unknown }).merged);
    const message = redactSandboxLog(
      String((res.data as { message?: unknown }).message ?? "").trim(),
    );
    const sha = String((res.data as { sha?: unknown }).sha ?? "").trim();

    if (!merged || !sha) {
      throw new AppError(
        "conflict",
        409,
        message || "Pull request cannot be merged.",
      );
    }

    return { merged: true, message: message || "Merged.", sha };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      "bad_gateway",
      502,
      "Failed to merge pull request via GitHub.",
      toSafeGitHubCause(err),
    );
  }
}
