import "server-only";

import type { Octokit } from "@octokit/rest";

import { AppError } from "@/lib/core/errors";
import { getGitHubClient } from "@/lib/repo/github.client.server";

/**
 * Coarse runtime kind used to pick the Vercel Sandbox image and verification flow.
 */
export type RepoRuntimeKind = "node" | "python";

/**
 * Non-secret evidence used to pick a repo runtime kind.
 */
export type RepoRuntimeDetection = Readonly<{
  kind: RepoRuntimeKind;
  evidence: Readonly<{
    hasPackageJson: boolean;
    hasPyprojectToml: boolean;
    hasRequirementsTxt: boolean;
  }>;
}>;

function getErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const status = (err as Readonly<{ status?: unknown }>).status;
  return typeof status === "number" ? status : null;
}

async function pathExists(
  octokit: Octokit,
  input: Readonly<{ owner: string; repo: string; path: string; ref?: string }>,
  opts: Readonly<{ onError: "default_false" | "throw" }>,
): Promise<boolean> {
  try {
    await octokit.repos.getContent({
      owner: input.owner,
      path: input.path,
      repo: input.repo,
      ...(input.ref ? { ref: input.ref } : {}),
    });
    return true;
  } catch (err) {
    const status = getErrorStatus(err);
    if (status === 404) return false;
    if (opts.onError === "default_false") return false;
    throw new AppError(
      "bad_gateway",
      502,
      "GitHub API error while detecting repo runtime kind.",
    );
  }
}

/**
 * Detect whether a GitHub repo should run in a Node or Python sandbox runtime.
 *
 * @remarks
 * This is best-effort and intentionally coarse: it only checks for a few
 * canonical repo-root files.
 *
 * @param input - Repo identity and optional ref (branch/SHA).
 * @returns Runtime kind and evidence booleans.
 */
export async function detectGitHubRepoRuntimeKind(
  input: Readonly<{ owner: string; repo: string; ref?: string }>,
): Promise<RepoRuntimeDetection> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  if (!owner || !repo) {
    return {
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    };
  }

  const octokit = getGitHubClient();

  const [hasPackageJson, hasPyprojectToml, hasRequirementsTxt] =
    await Promise.all([
      pathExists(
        octokit,
        {
          owner,
          path: "package.json",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "default_false" },
      ),
      pathExists(
        octokit,
        {
          owner,
          path: "pyproject.toml",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "default_false" },
      ),
      pathExists(
        octokit,
        {
          owner,
          path: "requirements.txt",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "default_false" },
      ),
    ]);

  const hasPythonMarkers = hasPyprojectToml || hasRequirementsTxt;

  const kind: RepoRuntimeKind =
    hasPackageJson && !hasPythonMarkers
      ? "node"
      : hasPythonMarkers && !hasPackageJson
        ? "python"
        : "node";

  return {
    evidence: { hasPackageJson, hasPyprojectToml, hasRequirementsTxt },
    kind,
  };
}

/**
 * Detect whether a GitHub repo should run in a Node or Python sandbox runtime.
 *
 * @remarks
 * This behaves like {@link detectGitHubRepoRuntimeKind}, but throws on GitHub API
 * errors instead of silently defaulting missing evidence to false. Use this for
 * flows where an incorrect runtime choice would lead to misleading failures
 * (e.g. Implementation Runs).
 *
 * @param input - Repo identity and optional ref (branch/SHA).
 * @returns Runtime kind and evidence booleans.
 * @throws AppError - With code "bad_gateway" when GitHub API calls fail.
 */
export async function detectGitHubRepoRuntimeKindStrict(
  input: Readonly<{ owner: string; repo: string; ref?: string }>,
): Promise<RepoRuntimeDetection> {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  if (!owner || !repo) {
    return {
      evidence: {
        hasPackageJson: false,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    };
  }

  const octokit = getGitHubClient();

  const [hasPackageJson, hasPyprojectToml, hasRequirementsTxt] =
    await Promise.all([
      pathExists(
        octokit,
        {
          owner,
          path: "package.json",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "throw" },
      ),
      pathExists(
        octokit,
        {
          owner,
          path: "pyproject.toml",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "throw" },
      ),
      pathExists(
        octokit,
        {
          owner,
          path: "requirements.txt",
          repo,
          ...(input.ref ? { ref: input.ref } : {}),
        },
        { onError: "throw" },
      ),
    ]);

  const hasPythonMarkers = hasPyprojectToml || hasRequirementsTxt;

  const kind: RepoRuntimeKind =
    hasPackageJson && !hasPythonMarkers
      ? "node"
      : hasPythonMarkers && !hasPackageJson
        ? "python"
        : "node";

  return {
    evidence: { hasPackageJson, hasPyprojectToml, hasRequirementsTxt },
    kind,
  };
}
