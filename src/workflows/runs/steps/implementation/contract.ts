import "server-only";

import type { RepoRuntimeKind } from "@/lib/repo/repo-kind.server";

/**
 * Sandbox repo root used for implementation runs.
 *
 * @remarks
 * This is the working directory used by sandbox jobs for checkout/patch/verify
 * in the implementation run pipeline.
 */
export const SANDBOX_REPO_ROOT = "/vercel/sandbox";

/**
 * Preflight outputs for implementation runs (no secrets).
 */
export type ImplementationPreflight = Readonly<{
  ok: true;
  aiGatewayBaseUrl: string;
  aiGatewayChatModel: string;
  sandboxAuth: "oidc" | "token";
  githubConfigured: true;
}>;

/**
 * Implementation run repo context (non-secret).
 */
export type ImplementationRepoContext = Readonly<{
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

/**
 * Sandbox checkout outputs for implementation runs (non-secret).
 */
export type ImplementationSandboxCheckout = Readonly<{
  sandboxId: string;
  repoPath: string;
  branchName: string;
  baseBranch: string;
  sandboxJobId: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

/**
 * Plan outputs produced by the planner LLM call.
 */
export type ImplementationPlan = Readonly<{
  planMarkdown: string;
  prTitle: string;
  prBody: string;
  commitMessage: string;
}>;

/**
 * Patch application outputs (commit identity only).
 */
export type ImplementationPatchResult = Readonly<{
  branchName: string;
  commitSha: string;
  addedFilePath: string;
  sandboxJobId: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

/**
 * Verification outputs for the full suite.
 */
export type ImplementationVerifyResult =
  | Readonly<{
      kind: "node";
      ok: true;
      lint: Readonly<{ exitCode: number }>;
      typecheck: Readonly<{ exitCode: number }>;
      test: Readonly<{ exitCode: number }>;
      build: Readonly<{ exitCode: number }>;
      sandboxJobId: string;
      transcriptBlobRef: string | null;
      transcriptTruncated: boolean;
    }>
  | Readonly<{
      kind: "python";
      ok: true;
      lint: Readonly<{ exitCode: number }>;
      typecheck: Readonly<{ exitCode: number }>;
      typecheckTool: "pyright" | "mypy";
      test: Readonly<{ exitCode: number }>;
      sandboxJobId: string;
      transcriptBlobRef: string | null;
      transcriptTruncated: boolean;
    }>;

/**
 * Pull request outputs persisted for the run.
 */
export type ImplementationPullRequestResult = Readonly<{
  prNumber: number;
  prUrl: string;
  prTitle: string;
  head: string;
  base: string;
}>;
