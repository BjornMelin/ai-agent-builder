import "server-only";

import { Octokit } from "@octokit/rest";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";

/**
 * Minimal non-secret GitHub repository metadata used by RepoOps.
 */
export type GitHubRepoInfo = Readonly<{
  owner: string;
  name: string;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
}>;

/**
 * Checks if GitHub API access is configured (GITHUB_TOKEN is set).
 *
 * @returns True when GitHub API access is configured.
 */
export function isGitHubConfigured(): boolean {
  const token = env.github.token;
  return typeof token === "string" && token.trim().length > 0;
}

/**
 * Create an authenticated Octokit client.
 *
 * @returns Octokit client.
 * @throws AppError - With code "env_invalid" when GitHub env is missing/invalid.
 */
export function getGitHubClient(): Octokit {
  const token = env.github.token;
  if (!token) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "github": missing GITHUB_TOKEN. See docs/ops/env.md.',
    );
  }
  return new Octokit({ auth: token });
}

/**
 * Fetch repository metadata from the GitHub API.
 *
 * @param input - Repo identity.
 * @returns Repo metadata.
 */
export async function fetchGitHubRepoInfo(
  input: Readonly<{ owner: string; name: string }>,
): Promise<GitHubRepoInfo> {
  const owner = input.owner.trim();
  const repo = input.name.trim();
  if (!owner || !repo) {
    throw new AppError("bad_request", 400, "Invalid repo owner/name.");
  }

  const octokit = getGitHubClient();
  const res = await octokit.repos.get({ owner, repo });
  const data = res.data;

  const defaultBranch = String(data.default_branch ?? "").trim();
  const cloneUrl = String(data.clone_url ?? "").trim();
  const htmlUrl = String(data.html_url ?? "").trim();
  const normalizedOwner = String(data.owner?.login ?? owner).trim();
  const normalizedName = String(data.name ?? repo).trim();

  if (!defaultBranch || !cloneUrl || !htmlUrl) {
    throw new AppError(
      "bad_gateway",
      502,
      "GitHub API response is missing required repository fields.",
    );
  }

  return {
    cloneUrl,
    defaultBranch,
    htmlUrl,
    name: normalizedName,
    owner: normalizedOwner,
  };
}
