import "server-only";

import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { AppError } from "@/lib/core/errors";
import {
  detectGitHubRepoRuntimeKindStrict,
  type RepoRuntimeKind,
} from "@/lib/repo/repo-kind.server";
import type { ImplementationRepoContext } from "@/workflows/runs/steps/implementation/contract";

/**
 * Resolve the connected repo for a project and compute the implementation branch name.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param input - Project scope and run identity.
 * @returns Repo context required for sandbox checkout and PR creation.
 */
export async function ensureImplementationRepoContext(
  input: Readonly<{ projectId: string; runId: string }>,
): Promise<ImplementationRepoContext> {
  "use step";

  const db = getDb();

  const project = await db.query.projectsTable.findFirst({
    columns: { name: true, slug: true },
    where: eq(schema.projectsTable.id, input.projectId),
  });

  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }

  const repo = await db.query.reposTable.findFirst({
    orderBy: (t) => [asc(t.createdAt)],
    where: eq(schema.reposTable.projectId, input.projectId),
  });

  if (!repo) {
    throw new AppError(
      "conflict",
      409,
      "No repository is connected to this project. Connect a GitHub repository to enable implementation runs.",
    );
  }

  const branchName = `agent/${project.slug}/${input.runId}`;

  const detected = await detectGitHubRepoRuntimeKindStrict({
    owner: repo.owner,
    ref: repo.defaultBranch,
    repo: repo.name,
  });

  return {
    branchName,
    cloneUrl: repo.cloneUrl,
    defaultBranch: repo.defaultBranch,
    htmlUrl: repo.htmlUrl,
    name: repo.name,
    owner: repo.owner,
    projectId: input.projectId,
    projectName: project.name,
    projectSlug: project.slug,
    provider: repo.provider as "github",
    repoId: repo.id,
    repoKind: detected.kind,
  } satisfies Readonly<{
    projectId: string;
    projectName: string;
    projectSlug: string;
    repoId: string;
    provider: "github";
    repoKind: RepoRuntimeKind;
    owner: string;
    name: string;
    cloneUrl: string;
    htmlUrl: string;
    defaultBranch: string;
    branchName: string;
  }>;
}
