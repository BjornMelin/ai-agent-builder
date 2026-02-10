import "server-only";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import { attachSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";
import type { ImplementationPatchResult } from "@/workflows/runs/steps/implementation/contract";
import { SANDBOX_REPO_ROOT } from "@/workflows/runs/steps/implementation/contract";

function assertGitHubToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new AppError("env_invalid", 500, "Invalid GITHUB_TOKEN.");
  }
  return trimmed;
}

function toNewFilePatch(
  input: Readonly<{ filePath: string; content: string }>,
): string {
  const normalized = input.filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid patch file path.");
  }

  const lines = input.content.replaceAll("\r\n", "\n").split("\n");
  // Ensure file ends with a trailing newline for stable patch application.
  if (lines.at(-1) !== "") {
    lines.push("");
  }

  const hunkLines = lines.map((line) => `+${line}`).join("\n");
  const total = lines.length;

  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 +1,${total} @@`,
    hunkLines,
    "",
  ].join("\n");
}

/**
 * Apply a deterministic patch in the sandbox checkout and push a branch.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param input - Sandbox + repo context.
 * @returns Commit identity.
 */
export async function applyImplementationPatch(
  input: Readonly<{
    projectId: string;
    sandboxId: string;
    repoPath: string;
    branchName: string;
    runId: string;
    commitMessage: string;
    planMarkdown: string;
  }>,
): Promise<ImplementationPatchResult> {
  "use step";

  const token = assertGitHubToken(env.github.token ?? "");

  const addedFilePath = `implementation-run-${input.runId}.md`;
  const patch = toNewFilePatch({
    content: input.planMarkdown,
    filePath: addedFilePath,
  });
  const session = await attachSandboxJobSession({
    jobType: "implementation_patch",
    metadata: {
      branchName: input.branchName,
    },
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    stopOnFinalize: false,
  });

  const patchPath = `${SANDBOX_REPO_ROOT}/patch.diff`;
  const askPassPath = `${SANDBOX_REPO_ROOT}/.git-askpass.sh`;
  const askPassScript = [
    "#!/bin/sh",
    'case "$1" in',
    '*Username*) echo "x-access-token" ;;',
    '*Password*) echo "$GITHUB_TOKEN" ;;',
    '*) echo "" ;;',
    "esac",
    "",
  ].join("\n");

  let exitCode = 1;
  try {
    await session.sandbox.writeFiles([
      { content: Buffer.from(patch, "utf8"), path: patchPath },
      { content: Buffer.from(askPassScript, "utf8"), path: askPassPath },
    ]);

    const chmod = await session.runCommand({
      args: ["700", askPassPath],
      cmd: "chmod",
      cwd: SANDBOX_REPO_ROOT,
      policy: "implementation_run",
    });
    exitCode = chmod.exitCode;
    if (chmod.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to chmod askpass script (exit ${chmod.exitCode}).`,
      );
    }

    const apply = await session.runCommand({
      args: ["-C", input.repoPath, "apply", "--index", patchPath],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = apply.exitCode;
    if (apply.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to apply patch (exit ${apply.exitCode}).`,
      );
    }

    // Ensure commits have stable identity.
    const configName = await session.runCommand({
      args: ["-C", input.repoPath, "config", "user.name", "AI Agent Builder"],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = configName.exitCode;
    if (configName.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to set git user.name (exit ${configName.exitCode}).`,
      );
    }

    const configEmail = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "config",
        "user.email",
        "ai-agent-builder@users.noreply.github.com",
      ],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = configEmail.exitCode;
    if (configEmail.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to set git user.email (exit ${configEmail.exitCode}).`,
      );
    }

    const commit = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "commit",
        "--no-gpg-sign",
        "-m",
        input.commitMessage,
      ],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = commit.exitCode;
    if (commit.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `git commit failed (exit ${commit.exitCode}).`,
      );
    }

    const rev = await session.runCommand({
      args: ["-C", input.repoPath, "rev-parse", "HEAD"],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = rev.exitCode;
    if (rev.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to resolve commit SHA (exit ${rev.exitCode}).`,
      );
    }

    const commitSha = rev.transcript.stdout.trim();
    if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
      throw new AppError("bad_gateway", 502, "Missing commit SHA output.");
    }

    const push = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "push",
        "--set-upstream",
        "origin",
        input.branchName,
      ],
      cmd: "git",
      env: {
        GIT_ASKPASS: askPassPath,
        GIT_TERMINAL_PROMPT: "0",
        GITHUB_TOKEN: token,
      },
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = push.exitCode;
    if (push.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `git push failed (exit ${push.exitCode}).`,
      );
    }

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      addedFilePath,
      branchName: input.branchName,
      commitSha,
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
      // If patching fails, stop the sandbox to avoid leaking resources.
      await session.sandbox.stop();
    } catch {
      // Best effort only.
    }
    throw err;
  }
}
