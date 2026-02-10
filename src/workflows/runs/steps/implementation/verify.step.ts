import "server-only";

import { AppError } from "@/lib/core/errors";
import type { RepoRuntimeKind } from "@/lib/repo/repo-kind.server";
import { attachSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";
import type { ImplementationVerifyResult } from "@/workflows/runs/steps/implementation/contract";

async function verifyPythonRepo(
  input: Readonly<{ repoPath: string }>,
  deps: Readonly<{
    runCommand: (
      cmd: Readonly<{
        cmd: string;
        args: readonly string[];
        cwd: string;
        policy: "implementation_run";
      }>,
    ) => Promise<Readonly<{ exitCode: number }>>;
  }>,
): Promise<
  Readonly<{
    lintExitCode: number;
    testExitCode: number;
    typecheck: { exitCode: number; tool: "pyright" | "mypy" };
  }>
> {
  const ruffVersion = await deps.runCommand({
    args: ["run", "ruff", "--version"],
    cmd: "uv",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  if (ruffVersion.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      "Python repo is missing ruff. Add it to the project and run via `uv run ruff`.",
    );
  }

  const lint = await deps.runCommand({
    args: ["run", "ruff", "check", "."],
    cmd: "uv",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  if (lint.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `ruff failed (exit ${lint.exitCode}).`,
    );
  }

  let typecheckTool: "pyright" | "mypy" = "pyright";
  let typecheckExitCode = 1;

  const pyrightVersion = await deps.runCommand({
    args: ["run", "pyright", "--version"],
    cmd: "uv",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  if (pyrightVersion.exitCode === 0) {
    const pyright = await deps.runCommand({
      args: ["run", "pyright"],
      cmd: "uv",
      cwd: input.repoPath,
      policy: "implementation_run",
    });
    typecheckExitCode = pyright.exitCode;
    if (pyright.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `pyright failed (exit ${pyright.exitCode}).`,
      );
    }
  } else {
    typecheckTool = "mypy";
    const mypyVersion = await deps.runCommand({
      args: ["run", "mypy", "--version"],
      cmd: "uv",
      cwd: input.repoPath,
      policy: "implementation_run",
    });
    if (mypyVersion.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        "Python repo is missing a type checker (pyright or mypy). Add one and run via `uv run`.",
      );
    }

    const mypy = await deps.runCommand({
      args: ["run", "mypy", "."],
      cmd: "uv",
      cwd: input.repoPath,
      policy: "implementation_run",
    });
    typecheckExitCode = mypy.exitCode;
    if (mypy.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `mypy failed (exit ${mypy.exitCode}).`,
      );
    }
  }

  const pytestVersion = await deps.runCommand({
    args: ["run", "pytest", "--version"],
    cmd: "uv",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  if (pytestVersion.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      "Python repo is missing pytest. Add it to the project and run via `uv run pytest`.",
    );
  }

  const test = await deps.runCommand({
    args: ["run", "pytest"],
    cmd: "uv",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  if (test.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `pytest failed (exit ${test.exitCode}).`,
    );
  }

  return {
    lintExitCode: lint.exitCode,
    testExitCode: test.exitCode,
    typecheck: { exitCode: typecheckExitCode, tool: typecheckTool },
  };
}

async function verifyNodeRepo(
  input: Readonly<{ repoPath: string }>,
  deps: Readonly<{
    runCommand: (
      cmd: Readonly<{
        cmd: string;
        args: readonly string[];
        cwd: string;
        policy: "implementation_run";
      }>,
    ) => Promise<Readonly<{ exitCode: number }>>;
  }>,
): Promise<
  Readonly<{
    lintExitCode: number;
    testExitCode: number;
    typecheckExitCode: number;
    buildExitCode: number;
  }>
> {
  const bunWhich = await deps.runCommand({
    args: ["bun"],
    cmd: "which",
    cwd: input.repoPath,
    policy: "implementation_run",
  });
  const runner =
    bunWhich.exitCode === 0
      ? ("bun" as const)
      : (
            await deps.runCommand({
              args: ["-f", `${input.repoPath}/pnpm-lock.yaml`],
              cmd: "test",
              cwd: input.repoPath,
              policy: "implementation_run",
            })
          ).exitCode === 0
        ? ("pnpm" as const)
        : ("npm" as const);

  const runScript = async (script: string) =>
    await deps.runCommand({
      args: ["run", script],
      cmd: runner,
      cwd: input.repoPath,
      policy: "implementation_run",
    });

  const lint = await runScript("lint");
  if (lint.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `lint failed (exit ${lint.exitCode}).`,
    );
  }

  const typecheck = await runScript("typecheck");
  if (typecheck.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `typecheck failed (exit ${typecheck.exitCode}).`,
    );
  }

  const test = await runScript("test");
  if (test.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `test failed (exit ${test.exitCode}).`,
    );
  }

  const build = await runScript("build");
  if (build.exitCode !== 0) {
    throw new AppError(
      "bad_gateway",
      502,
      `build failed (exit ${build.exitCode}).`,
    );
  }

  return {
    buildExitCode: build.exitCode,
    lintExitCode: lint.exitCode,
    testExitCode: test.exitCode,
    typecheckExitCode: typecheck.exitCode,
  };
}

/**
 * Run the full verification suite in the sandbox checkout.
 *
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
 *
 * @param input - Sandbox + repo path.
 * @returns Verification result.
 */
export async function verifyImplementationRun(
  input: Readonly<{
    projectId: string;
    runId: string;
    sandboxId: string;
    repoPath: string;
    repoKind: RepoRuntimeKind;
  }>,
): Promise<ImplementationVerifyResult> {
  "use step";

  const session = await attachSandboxJobSession({
    jobType: "implementation_verify",
    metadata: {},
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    // We don't need the sandbox after full verification completes.
    stopOnFinalize: true,
  });

  let exitCode = 1;
  try {
    const runCommand = async (cmd: {
      cmd: string;
      args: readonly string[];
      cwd: string;
    }) => {
      const res = await session.runCommand({
        args: [...cmd.args],
        cmd: cmd.cmd,
        cwd: cmd.cwd,
        policy: "implementation_run",
      });
      return { exitCode: res.exitCode };
    };

    if (input.repoKind === "python") {
      const python = await verifyPythonRepo(
        { repoPath: input.repoPath },
        { runCommand: (cmd) => runCommand(cmd) },
      );
      exitCode = 0;

      const finalized = await session.finalize({
        exitCode: 0,
        status: "succeeded",
      });

      return {
        kind: "python",
        lint: { exitCode: python.lintExitCode },
        ok: true,
        sandboxJobId: finalized.job.id,
        test: { exitCode: python.testExitCode },
        transcriptBlobRef: finalized.job.transcriptBlobRef,
        transcriptTruncated: finalized.transcript.truncated,
        typecheck: { exitCode: python.typecheck.exitCode },
        typecheckTool: python.typecheck.tool,
      };
    }

    const node = await verifyNodeRepo(
      { repoPath: input.repoPath },
      { runCommand: (cmd) => runCommand(cmd) },
    );
    exitCode = 0;

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      build: { exitCode: node.buildExitCode },
      kind: "node",
      lint: { exitCode: node.lintExitCode },
      ok: true,
      sandboxJobId: finalized.job.id,
      test: { exitCode: node.testExitCode },
      transcriptBlobRef: finalized.job.transcriptBlobRef,
      transcriptTruncated: finalized.transcript.truncated,
      typecheck: { exitCode: node.typecheckExitCode },
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
