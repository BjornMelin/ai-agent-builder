import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import {
  fail,
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

describe("applyImplementationPatch", () => {
  it("applies a patch, resolves commit SHA, and pushes", async () => {
    const sha = "9f8311cbf8746bc24d052cea5b9670a481eb9a52";

    const session = makeScriptedSession([
      { match: matchCmd("chmod"), result: ok() },
      { match: matchCmd("git", ["apply"]), result: ok() },
      { match: matchCmd("git", ["user.name"]), result: ok() },
      { match: matchCmd("git", ["user.email"]), result: ok() },
      { match: matchCmd("git", ["commit"]), result: ok() },
      {
        match: matchCmd("git", ["rev-parse"]),
        result: ok({ combined: sha, stdout: `${sha}\n` }),
      },
      { match: matchCmd("git", ["push"]), result: ok() },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { applyImplementationPatch } = await import("./patch.step");
    await expect(
      applyImplementationPatch({
        branchName: "agent/project/run_1",
        commitMessage: "feat: plan",
        planMarkdown: "# Plan",
        projectId: "proj_1",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({
      branchName: "agent/project/run_1",
      commitSha: sha,
    });

    expect(session.sandbox.writeFiles).toHaveBeenCalled();
  });

  it("throws bad_gateway when commit SHA output is missing and stops the sandbox", async () => {
    const session = makeScriptedSession([
      { match: matchCmd("chmod"), result: ok() },
      { match: matchCmd("git", ["apply"]), result: ok() },
      { match: matchCmd("git", ["user.name"]), result: ok() },
      { match: matchCmd("git", ["user.email"]), result: ok() },
      { match: matchCmd("git", ["commit"]), result: ok() },
      { match: matchCmd("git", ["rev-parse"]), result: ok({ stdout: "" }) },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { applyImplementationPatch } = await import("./patch.step");
    await expect(
      applyImplementationPatch({
        branchName: "agent/project/run_1",
        commitMessage: "feat: plan",
        planMarkdown: "# Plan",
        projectId: "proj_1",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });

    expect(session.sandbox.stop).toHaveBeenCalled();
  });

  it("stops the sandbox on command failures (best effort) and rethrows", async () => {
    const session = makeScriptedSession([
      {
        match: matchCmd("chmod"),
        result: fail({ transcript: { stderr: "nope" } }),
      },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { applyImplementationPatch } = await import("./patch.step");
    await expect(
      applyImplementationPatch({
        branchName: "agent/project/run_1",
        commitMessage: "feat: plan",
        planMarkdown: "# Plan",
        projectId: "proj_1",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });

    expect(session.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(session.sandbox.stop).toHaveBeenCalled();
  });
});
