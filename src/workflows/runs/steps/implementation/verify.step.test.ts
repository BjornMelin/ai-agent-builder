import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import {
  makeScriptedSession,
  matchCmd,
  ok,
} from "@tests/utils/scripted-sandbox-session";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = installImplementationRunHarness();
const { state } = harness;

beforeEach(() => {
  vi.clearAllMocks();
  harness.reset();
});

describe("verifyImplementationRun", () => {
  it("verifies node repos by running lint/typecheck/test/build scripts via bun", async () => {
    const session = makeScriptedSession([
      {
        match: matchCmd("which", ["bun"]),
        result: ok({ stdout: "/usr/bin/bun\n" }),
      },
      { match: matchCmd("bun", ["lint"]), result: ok() },
      { match: matchCmd("bun", ["typecheck"]), result: ok() },
      { match: matchCmd("bun", ["test"]), result: ok() },
      { match: matchCmd("bun", ["build"]), result: ok() },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./verify.step");
    await expect(
      verifyImplementationRun({
        projectId: "proj_1",
        repoKind: "node",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({ kind: "node", ok: true });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["run", "lint"], cmd: "bun" }),
    );
  });

  it("uses pnpm when bun is missing and pnpm-lock.yaml exists", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("which", ["bun"]), result: { ...ok(), exitCode: 1 } },
      { match: matchCmd("test", ["pnpm-lock.yaml"]), result: ok() },
      { match: matchCmd("pnpm", ["lint"]), result: ok() },
      { match: matchCmd("pnpm", ["typecheck"]), result: ok() },
      { match: matchCmd("pnpm", ["test"]), result: ok() },
      { match: matchCmd("pnpm", ["build"]), result: ok() },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./verify.step");
    await expect(
      verifyImplementationRun({
        projectId: "proj_1",
        repoKind: "node",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({ kind: "node", ok: true });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["run", "lint"], cmd: "pnpm" }),
    );
  });

  it("verifies python repos using ruff, mypy fallback, and pytest", async () => {
    const session = makeScriptedSession([
      {
        match: matchCmd("uv", ["ruff", "--version"]),
        result: ok({ stdout: "ruff 0.0.0\n" }),
      },
      { match: matchCmd("uv", ["ruff", "check"]), result: ok() },
      {
        match: matchCmd("uv", ["pyright", "--version"]),
        result: { ...ok(), exitCode: 1 },
      },
      {
        match: matchCmd("uv", ["mypy", "--version"]),
        result: ok({ stdout: "mypy 1.0\n" }),
      },
      { match: matchCmd("uv", ["mypy", "."]), result: ok() },
      {
        match: matchCmd("uv", ["pytest", "--version"]),
        result: ok({ stdout: "pytest\n" }),
      },
      { match: matchCmd("uv", ["pytest"]), result: ok() },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./verify.step");
    await expect(
      verifyImplementationRun({
        projectId: "proj_1",
        repoKind: "python",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({
      kind: "python",
      ok: true,
      typecheckTool: "mypy",
    });
  });

  it("uses pyright when present in python repos", async () => {
    const session = makeScriptedSession([
      {
        match: matchCmd("uv", ["ruff", "--version"]),
        result: ok({ stdout: "ruff 0.0.0\n" }),
      },
      { match: matchCmd("uv", ["ruff", "check"]), result: ok() },
      {
        match: matchCmd("uv", ["pyright", "--version"]),
        result: ok({ stdout: "1.0.0\n" }),
      },
      { match: matchCmd("uv", ["pyright"]), result: ok() },
      {
        match: matchCmd("uv", ["pytest", "--version"]),
        result: ok({ stdout: "pytest\n" }),
      },
      { match: matchCmd("uv", ["pytest"]), result: ok() },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./verify.step");
    await expect(
      verifyImplementationRun({
        projectId: "proj_1",
        repoKind: "python",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({
      kind: "python",
      ok: true,
      typecheckTool: "pyright",
    });
  });
});
