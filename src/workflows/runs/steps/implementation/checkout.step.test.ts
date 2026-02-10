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

describe("sandboxCheckoutImplementationRepo", () => {
  it("chooses bun install when bun is present and bun.lock exists", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("git", ["checkout"]), result: ok() },
      {
        match: matchCmd("test", ["bun.lockb"]),
        result: { ...ok(), exitCode: 1 },
      },
      { match: matchCmd("test", ["bun.lock"]), result: ok() },
      {
        match: matchCmd("which", ["bun"]),
        result: ok({ stdout: "/usr/bin/bun\n" }),
      },
      { match: matchCmd("bun", ["install"]), result: ok() },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./checkout.step"
    );
    await expect(
      sandboxCheckoutImplementationRepo({
        branchName: "agent/project/run_1",
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        projectId: "proj_1",
        repoKind: "node",
        runId: "run_1",
      }),
    ).resolves.toMatchObject({
      baseBranch: "main",
      branchName: "agent/project/run_1",
      repoPath: "/vercel/sandbox",
      sandboxId: "sb_1",
    });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["install", "--frozen-lockfile"],
        cmd: "bun",
      }),
    );
  });

  it("chooses pnpm install when pnpm-lock.yaml exists and bun is unavailable", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("git", ["checkout"]), result: ok() },
      {
        match: matchCmd("test", ["bun.lockb"]),
        result: { ...ok(), exitCode: 1 },
      },
      {
        match: matchCmd("test", ["bun.lock"]),
        result: { ...ok(), exitCode: 1 },
      },
      { match: matchCmd("test", ["pnpm-lock.yaml"]), result: ok() },
      {
        match: matchCmd("test", ["package-lock.json"]),
        result: { ...ok(), exitCode: 1 },
      },
      { match: matchCmd("which", ["bun"]), result: { ...ok(), exitCode: 1 } },
      { match: matchCmd("pnpm", ["install"]), result: ok() },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./checkout.step"
    );

    await expect(
      sandboxCheckoutImplementationRepo({
        branchName: "agent/project/run_1",
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        projectId: "proj_1",
        repoKind: "node",
        runId: "run_1",
      }),
    ).resolves.toMatchObject({ sandboxId: "sb_1" });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["install", "--frozen-lockfile"],
        cmd: "pnpm",
      }),
    );
  });

  it("chooses npm ci when package-lock.json exists and bun/pnpm are unavailable", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("git", ["checkout"]), result: ok() },
      {
        match: matchCmd("test", ["bun.lockb"]),
        result: { ...ok(), exitCode: 1 },
      },
      {
        match: matchCmd("test", ["bun.lock"]),
        result: { ...ok(), exitCode: 1 },
      },
      {
        match: matchCmd("test", ["pnpm-lock.yaml"]),
        result: { ...ok(), exitCode: 1 },
      },
      { match: matchCmd("test", ["package-lock.json"]), result: ok() },
      { match: matchCmd("which", ["bun"]), result: { ...ok(), exitCode: 1 } },
      { match: matchCmd("npm", ["ci"]), result: ok() },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./checkout.step"
    );

    await expect(
      sandboxCheckoutImplementationRepo({
        branchName: "agent/project/run_1",
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        projectId: "proj_1",
        repoKind: "node",
        runId: "run_1",
      }),
    ).resolves.toMatchObject({ sandboxId: "sb_1" });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["ci"], cmd: "npm" }),
    );
  });

  it("runs uv sync for python repos (frozen when uv.lock exists)", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("git", ["checkout"]), result: ok() },
      { match: matchCmd("test", ["uv.lock"]), result: ok() },
      { match: matchCmd("uv", ["sync"]), result: ok() },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./checkout.step"
    );
    await expect(
      sandboxCheckoutImplementationRepo({
        branchName: "agent/project/run_1",
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        projectId: "proj_1",
        repoKind: "python",
        runId: "run_1",
      }),
    ).resolves.toMatchObject({ sandboxId: "sb_1" });

    expect(session.runCommand).toHaveBeenCalledWith(
      expect.objectContaining({ args: ["sync", "--frozen"], cmd: "uv" }),
    );
  });

  it("throws bad_gateway when git checkout fails and stops the sandbox", async () => {
    const session = makeScriptedSession([
      {
        match: matchCmd("git", ["checkout"]),
        result: {
          exitCode: 1,
          transcript: { combined: "", stderr: "boom", stdout: "" },
        },
      },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./checkout.step"
    );

    await expect(
      sandboxCheckoutImplementationRepo({
        branchName: "agent/project/run_1",
        cloneUrl: "https://example.com/repo.git",
        defaultBranch: "main",
        projectId: "proj_1",
        repoKind: "node",
        runId: "run_1",
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });

    expect(session.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(session.sandbox.stop).toHaveBeenCalled();
  });
});
