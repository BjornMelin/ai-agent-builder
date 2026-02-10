import "server-only";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import type { RepoRuntimeKind } from "@/lib/repo/repo-kind.server";
import {
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";
import { startSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";
import type { ImplementationSandboxCheckout } from "@/workflows/runs/steps/implementation/contract";
import { SANDBOX_REPO_ROOT } from "@/workflows/runs/steps/implementation/contract";

function assertGitHubToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new AppError("env_invalid", 500, "Invalid GITHUB_TOKEN.");
  }
  return trimmed;
}

/**
 * Create a sandbox checkout and install dependencies.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param input - Repo connection + branch info.
 * @returns Sandbox identity and repo path.
 */
export async function sandboxCheckoutImplementationRepo(
  input: Readonly<{
    projectId: string;
    runId: string;
    cloneUrl: string;
    defaultBranch: string;
    branchName: string;
    repoKind: RepoRuntimeKind;
  }>,
): Promise<ImplementationSandboxCheckout> {
  "use step";

  const token = assertGitHubToken(env.github.token ?? "");

  const networkPolicy =
    input.repoKind === "python"
      ? SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT
      : SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT;
  const runtime = input.repoKind === "python" ? "python3.13" : "node24";

  const session = await startSandboxJobSession({
    jobType: "implementation_checkout",
    metadata: {
      baseBranch: input.defaultBranch,
      branchName: input.branchName,
      repoKind: input.repoKind,
    },
    networkPolicy,
    projectId: input.projectId,
    runId: input.runId,
    runtime,
    source: {
      depth: 1,
      password: token,
      revision: input.defaultBranch,
      type: "git",
      url: input.cloneUrl,
      username: "x-access-token",
    },
    stopOnFinalize: false,
    timeoutMs: 30 * 60 * 1000,
    vcpus: 2,
  });

  let exitCode = 1;
  try {
    const checkout = await session.runCommand({
      args: ["checkout", "-b", input.branchName],
      cmd: "git",
      cwd: SANDBOX_REPO_ROOT,
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = checkout.exitCode;
    if (checkout.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to create run branch (exit ${checkout.exitCode}).`,
      );
    }

    if (input.repoKind === "python") {
      const uvLock = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/uv.lock`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const sync = await session.runCommand({
        args: uvLock.exitCode === 0 ? ["sync", "--frozen"] : ["sync"],
        cmd: "uv",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      exitCode = sync.exitCode;
      if (sync.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `uv sync failed (exit ${sync.exitCode}).`,
        );
      }
    } else {
      // Independent checks: parallelize to avoid unnecessary waterfalls.
      const [bunLockb, bunLock, pnpmLock, npmLock, bunWhich] =
        await Promise.all([
          session.runCommand({
            args: ["-f", `${SANDBOX_REPO_ROOT}/bun.lockb`],
            cmd: "test",
            cwd: SANDBOX_REPO_ROOT,
            policy: "implementation_run",
          }),
          session.runCommand({
            args: ["-f", `${SANDBOX_REPO_ROOT}/bun.lock`],
            cmd: "test",
            cwd: SANDBOX_REPO_ROOT,
            policy: "implementation_run",
          }),
          session.runCommand({
            args: ["-f", `${SANDBOX_REPO_ROOT}/pnpm-lock.yaml`],
            cmd: "test",
            cwd: SANDBOX_REPO_ROOT,
            policy: "implementation_run",
          }),
          session.runCommand({
            args: ["-f", `${SANDBOX_REPO_ROOT}/package-lock.json`],
            cmd: "test",
            cwd: SANDBOX_REPO_ROOT,
            policy: "implementation_run",
          }),
          session.runCommand({
            args: ["bun"],
            cmd: "which",
            cwd: SANDBOX_REPO_ROOT,
            policy: "implementation_run",
          }),
        ]);

      const hasBunLock = bunLockb.exitCode === 0 || bunLock.exitCode === 0;
      const hasBun = bunWhich.exitCode === 0;
      const hasPnpmLock = pnpmLock.exitCode === 0;
      const hasNpmLock = npmLock.exitCode === 0;

      const install =
        hasBun && hasBunLock
          ? await session.runCommand({
              args: ["install", "--frozen-lockfile"],
              cmd: "bun",
              cwd: SANDBOX_REPO_ROOT,
              policy: "implementation_run",
            })
          : hasPnpmLock
            ? await session.runCommand({
                args: ["install", "--frozen-lockfile"],
                cmd: "pnpm",
                cwd: SANDBOX_REPO_ROOT,
                policy: "implementation_run",
              })
            : hasNpmLock
              ? await session.runCommand({
                  args: ["ci"],
                  cmd: "npm",
                  cwd: SANDBOX_REPO_ROOT,
                  policy: "implementation_run",
                })
              : await session.runCommand({
                  args: ["install"],
                  cmd: "npm",
                  cwd: SANDBOX_REPO_ROOT,
                  policy: "implementation_run",
                });

      exitCode = install.exitCode;
      if (install.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `Dependency install failed (exit ${install.exitCode}).`,
        );
      }
    }

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      baseBranch: input.defaultBranch,
      branchName: input.branchName,
      repoPath: SANDBOX_REPO_ROOT,
      sandboxId: session.sandbox.sandboxId,
      sandboxJobId: finalized.job.id,
      transcriptBlobRef: finalized.job.transcriptBlobRef,
      transcriptTruncated: finalized.transcript.truncated,
    };
  } catch (err) {
    try {
      await session.finalize({ exitCode, status: "failed" });
    } catch {
      // Best effort only.
    }
    try {
      await session.sandbox.stop();
    } catch {
      // Best effort only.
    }
    throw err;
  }
}
