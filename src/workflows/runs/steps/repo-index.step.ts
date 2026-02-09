import "server-only";

import { indexRepoFromSandbox } from "@/lib/repo/repo-indexer.server";
import { attachSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";

/**
 * Index the checked-out implementation repo for code-aware retrieval (FR-032).
 *
 * @param input - Sandbox checkout identity and repo scope.
 * @returns Indexing result (no secrets).
 */
export async function indexImplementationRepoStep(
  input: Readonly<{
    projectId: string;
    repoId: string;
    runId: string;
    sandboxId: string;
    repoPath: string;
    repoKind: "node" | "python";
  }>,
): Promise<
  Readonly<{
    sandboxJobId: string;
    transcriptBlobRef: string | null;
    transcriptTruncated: boolean;
    namespace: string;
    prefix: string;
    commitSha: string;
    filesIndexed: number;
    chunksIndexed: number;
  }>
> {
  "use step";
  // Retained in the contract for future language-specific indexing decisions.
  void input.repoKind;

  const session = await attachSandboxJobSession({
    jobType: "implementation_repo_index",
    metadata: { repoId: input.repoId },
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    stopOnFinalize: false,
  });

  let exitCode = 1;
  try {
    const runGit = async (
      cmdInput: Readonly<{
        cmd: string;
        args: readonly string[];
        cwd?: string;
      }>,
    ) => {
      let stdout = "";
      let stderr = "";
      const res = await session.runCommand({
        args: [...cmdInput.args],
        cmd: cmdInput.cmd,
        ...(cmdInput.cwd === undefined ? {} : { cwd: cmdInput.cwd }),
        onLog: (entry) => {
          if (entry.stream === "stdout") stdout += entry.data;
          else stderr += entry.data;
        },
        policy: "implementation_run",
      });
      return {
        exitCode: res.exitCode,
        stderr,
        stdout,
      };
    };

    const indexed = await indexRepoFromSandbox({
      projectId: input.projectId,
      repoId: input.repoId,
      repoPath: input.repoPath,
      runGit,
    });

    // Record a concise summary in the sandbox transcript for provenance.
    const summary = JSON.stringify({
      chunksIndexed: indexed.chunksIndexed,
      commitSha: indexed.commitSha,
      filesIndexed: indexed.filesIndexed,
      namespace: indexed.namespace,
      prefix: indexed.prefix,
    });
    await session.runCommand({
      args: ["-e", `console.log(${JSON.stringify(summary)})`],
      cmd: "node",
      cwd: input.repoPath,
      policy: "implementation_run",
    });

    exitCode = 0;
    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      chunksIndexed: indexed.chunksIndexed,
      commitSha: indexed.commitSha,
      filesIndexed: indexed.filesIndexed,
      namespace: indexed.namespace,
      prefix: indexed.prefix,
      sandboxJobId: finalized.job.id,
      transcriptBlobRef: finalized.job.transcriptBlobRef ?? null,
      transcriptTruncated: finalized.transcript.truncated,
    };
  } catch (err) {
    try {
      await session.finalize({ exitCode, status: "failed" });
    } catch {
      // Best effort only.
    }
    throw err;
  }
}
