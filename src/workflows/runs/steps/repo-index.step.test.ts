import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attachSandboxJobSession: vi.fn(),
  indexRepoFromSandbox: vi.fn(),
}));

vi.mock("@/lib/sandbox/sandbox-runner.server", () => ({
  attachSandboxJobSession: (...args: unknown[]) =>
    state.attachSandboxJobSession(...args),
}));

vi.mock("@/lib/repo/repo-indexer.server", () => ({
  indexRepoFromSandbox: (...args: unknown[]) =>
    state.indexRepoFromSandbox(...args),
}));

async function loadStep() {
  vi.resetModules();
  return await import("@/workflows/runs/steps/repo-index.step");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("indexImplementationRepoStep", () => {
  it("indexes the repo, logs a summary, and finalizes the sandbox job", async () => {
    const sandboxRunCommand = vi.fn(async () => ({
      exitCode: 0,
      stderr: async () => "",
      stdout: async () => "deadbeef\n",
    }));

    const session = {
      finalize: vi.fn(async () => ({
        job: { id: "job_1", transcriptBlobRef: "https://blob.example/log" },
        transcript: { combined: "", truncated: false },
      })),
      runCommand: vi.fn(async () => ({
        exitCode: 0,
        transcript: { combined: "", truncated: false },
      })),
      sandbox: { runCommand: sandboxRunCommand },
    };

    state.attachSandboxJobSession.mockResolvedValueOnce(session);
    state.indexRepoFromSandbox.mockImplementationOnce(
      async (input: unknown) => {
        const runGit =
          input && typeof input === "object"
            ? (input as { runGit: (x: unknown) => Promise<unknown> }).runGit
            : undefined;
        if (runGit) {
          await runGit({
            args: ["rev-parse", "HEAD"],
            cmd: "git",
            cwd: "/repo",
          });
        }

        return {
          chunksIndexed: 12,
          commitSha: "deadbeef",
          filesIndexed: 3,
          namespace: "proj_1/repo_1",
          prefix: "repo/repo_1",
        };
      },
    );

    const { indexImplementationRepoStep } = await loadStep();
    const res = await indexImplementationRepoStep({
      projectId: "proj_1",
      repoId: "repo_1",
      repoKind: "node",
      repoPath: "/repo",
      runId: "run_1",
      sandboxId: "sb_1",
    });

    expect(state.attachSandboxJobSession).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "implementation_repo_index",
        metadata: { repoId: "repo_1" },
        stopOnFinalize: false,
      }),
    );

    expect(sandboxRunCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "git" }),
    );

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: "node",
        policy: "implementation_run",
      }),
    );

    expect(session.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ exitCode: 0, status: "succeeded" }),
    );

    expect(res).toMatchObject({
      chunksIndexed: 12,
      commitSha: "deadbeef",
      filesIndexed: 3,
      prefix: "repo/repo_1",
      sandboxJobId: "job_1",
      transcriptBlobRef: "https://blob.example/log",
      transcriptTruncated: false,
    });
  });

  it("finalizes as failed on errors (best effort) and rethrows", async () => {
    const err = new Error("boom");

    const session = {
      finalize: vi.fn(async () => {}),
      runCommand: vi.fn(async () => ({
        exitCode: 0,
        transcript: { combined: "", truncated: false },
      })),
      sandbox: {
        runCommand: vi.fn(async () => ({
          exitCode: 1,
          stderr: async () => "fail",
          stdout: async () => "",
        })),
      },
    };

    state.attachSandboxJobSession.mockResolvedValueOnce(session);
    state.indexRepoFromSandbox.mockRejectedValueOnce(err);

    const { indexImplementationRepoStep } = await loadStep();
    await expect(
      indexImplementationRepoStep({
        projectId: "proj_1",
        repoId: "repo_1",
        repoKind: "node",
        repoPath: "/repo",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).rejects.toThrow(/boom/);

    expect(session.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ exitCode: 1, status: "failed" }),
    );
  });

  it("swallows finalize failures and still rethrows the original error", async () => {
    const err = new Error("boom");

    const session = {
      finalize: vi.fn(async () => {
        throw new Error("finalize failed");
      }),
      runCommand: vi.fn(async () => ({
        exitCode: 0,
        transcript: { combined: "", truncated: false },
      })),
      sandbox: {
        runCommand: vi.fn(async () => ({
          exitCode: 1,
          stderr: async () => "fail",
          stdout: async () => "",
        })),
      },
    };

    state.attachSandboxJobSession.mockResolvedValueOnce(session);
    state.indexRepoFromSandbox.mockRejectedValueOnce(err);

    const { indexImplementationRepoStep } = await loadStep();
    await expect(
      indexImplementationRepoStep({
        projectId: "proj_1",
        repoId: "repo_1",
        repoKind: "node",
        repoPath: "/repo",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).rejects.toThrow(/boom/);
  });
});
