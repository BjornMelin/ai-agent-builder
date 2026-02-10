import "server-only";

import { createOrGetPullRequest } from "@/lib/repo/repo-ops.server";
import type { ImplementationPullRequestResult } from "@/workflows/runs/steps/implementation/contract";

/**
 * Open (or fetch) a pull request for the run branch.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param input - Repo + branch identity and PR content.
 * @returns Pull request metadata.
 */
export async function openImplementationPullRequest(
  input: Readonly<{
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }>,
): Promise<ImplementationPullRequestResult> {
  "use step";

  const pr = await createOrGetPullRequest({
    base: input.base,
    body: input.body,
    head: input.head,
    owner: input.owner,
    repo: input.repo,
    title: input.title,
  });

  return {
    base: pr.baseRef,
    head: pr.headRef,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.htmlUrl,
  };
}
