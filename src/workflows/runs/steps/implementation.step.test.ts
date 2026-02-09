import { createMockLanguageModelV3Text } from "@tests/utils/ai-sdk";
import { generateText } from "ai";
import type { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SandboxTranscript = Readonly<{
  combined: string;
  stderr: string;
  stdout: string;
}>;

type SandboxCommandResult = Readonly<{
  exitCode: number;
  transcript: SandboxTranscript;
}>;

type SandboxFinalizeResult = Readonly<{
  job: Readonly<{ id: string; transcriptBlobRef: string | null }>;
  transcript: Readonly<{ truncated: boolean }>;
}>;

type SandboxSession = Readonly<{
  finalize: (
    input: Readonly<{ exitCode: number; status: string }>,
  ) => Promise<SandboxFinalizeResult>;
  runCommand: (
    input: Readonly<Record<string, unknown>>,
  ) => Promise<SandboxCommandResult>;
  sandbox: Readonly<{
    sandboxId: string;
    stop: () => Promise<void>;
    writeFiles: (
      files: readonly Readonly<{ content: Buffer; path: string }>[],
    ) => Promise<void>;
  }>;
}>;

const state = vi.hoisted(() => ({
  attachSandboxJobSession: vi.fn(),
  createGateway: vi.fn(),
  createOrGetPullRequest: vi.fn(),
  detectGitHubRepoRuntimeKind: vi.fn(),
  env: {
    aiGateway: {
      apiKey: "key",
      baseUrl: "https://ai-gateway.example.com",
      chatModel: "openai/gpt-4o",
    },
    github: {
      token: "token",
    },
    sandbox: {
      auth: "oidc" as "oidc" | "token",
      projectId: "proj",
      teamId: "team",
      token: "vercel-token",
    },
  },
  getDb: vi.fn(),
  getVercelSandbox: vi.fn(),
  startSandboxJobSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

vi.mock("@/lib/repo/repo-kind.server", () => ({
  detectGitHubRepoRuntimeKind: (...args: unknown[]) =>
    state.detectGitHubRepoRuntimeKind(...args),
}));

vi.mock("@/lib/repo/repo-ops.server", () => ({
  createOrGetPullRequest: (...args: unknown[]) =>
    state.createOrGetPullRequest(...args),
}));

vi.mock("@/lib/sandbox/sandbox-runner.server", () => ({
  attachSandboxJobSession: (...args: unknown[]) =>
    state.attachSandboxJobSession(...args),
  startSandboxJobSession: (...args: unknown[]) =>
    state.startSandboxJobSession(...args),
}));

vi.mock("@/lib/sandbox/sandbox-client.server", () => ({
  getVercelSandbox: (...args: unknown[]) => state.getVercelSandbox(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("ai")>();
  return {
    ...mod,
    createGateway: (...args: unknown[]) => state.createGateway(...args),
  };
});

function makeSession(
  script: ReadonlyArray<
    Readonly<{
      match: (input: Readonly<Record<string, unknown>>) => boolean;
      result: SandboxCommandResult;
    }>
  >,
): SandboxSession {
  const runCommand = vi.fn(async (input: Readonly<Record<string, unknown>>) => {
    const step = script.find((s) => s.match(input));
    if (!step) {
      return {
        exitCode: 0,
        transcript: { combined: "", stderr: "", stdout: "" },
      };
    }
    return step.result;
  });

  return {
    finalize: vi.fn(async () => ({
      job: { id: "job_1", transcriptBlobRef: "blob_1" },
      transcript: { truncated: false },
    })),
    runCommand,
    sandbox: {
      sandboxId: "sb_1",
      stop: vi.fn(async () => {}),
      writeFiles: vi.fn(async () => {}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.env.github.token = "token";

  state.detectGitHubRepoRuntimeKind.mockResolvedValue({
    evidence: {
      hasPackageJson: true,
      hasPyprojectToml: false,
      hasRequirementsTxt: false,
    },
    kind: "node",
  });

  state.getDb.mockReturnValue({
    query: {
      projectsTable: {
        findFirst: vi.fn(async () => ({ name: "Project", slug: "project" })),
      },
      reposTable: {
        findFirst: vi.fn(async () => ({
          cloneUrl: "https://example.com/repo.git",
          defaultBranch: "main",
          htmlUrl: "https://example.com/repo",
          id: "repo_1",
          name: "repo",
          owner: "owner",
          provider: "github",
        })),
      },
    },
  });

  state.createOrGetPullRequest.mockResolvedValue({
    baseRef: "main",
    headRef: "agent/project/run_1",
    htmlUrl: "https://example.com/pr/1",
    number: 1,
    title: "PR",
  });

  state.getVercelSandbox.mockResolvedValue({
    stop: vi.fn(async () => {}),
  });
});

describe("preflightImplementationRun", () => {
  it("throws env_invalid when GITHUB_TOKEN is missing", async () => {
    state.env.github.token = "";
    const { preflightImplementationRun } = await import(
      "./implementation.step"
    );
    await expect(preflightImplementationRun()).rejects.toMatchObject({
      code: "env_invalid",
      status: 500,
    });
  });

  it("returns non-secret preflight metadata", async () => {
    const { preflightImplementationRun } = await import(
      "./implementation.step"
    );
    await expect(preflightImplementationRun()).resolves.toMatchObject({
      aiGatewayBaseUrl: "https://ai-gateway.example.com",
      aiGatewayChatModel: "openai/gpt-4o",
      githubConfigured: true,
      ok: true,
      sandboxAuth: "oidc",
    });
  });
});

describe("ensureImplementationRepoContext", () => {
  it("throws not_found when project is missing", async () => {
    state.getDb.mockReturnValueOnce({
      query: {
        projectsTable: { findFirst: vi.fn(async () => null) },
        reposTable: { findFirst: vi.fn(async () => null) },
      },
    });

    const { ensureImplementationRepoContext } = await import(
      "./implementation.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws conflict when no repository is connected", async () => {
    state.getDb.mockReturnValueOnce({
      query: {
        projectsTable: {
          findFirst: vi.fn(async () => ({ name: "Project", slug: "project" })),
        },
        reposTable: { findFirst: vi.fn(async () => null) },
      },
    });

    const { ensureImplementationRepoContext } = await import(
      "./implementation.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("returns repo context with a deterministic branch name", async () => {
    const { ensureImplementationRepoContext } = await import(
      "./implementation.step"
    );
    await expect(
      ensureImplementationRepoContext({ projectId: "proj_1", runId: "run_1" }),
    ).resolves.toMatchObject({
      branchName: "agent/project/run_1",
      repoKind: "node",
    });
  });
});

describe("sandboxCheckoutImplementationRepo", () => {
  it("chooses bun install when bun is present and bun.lock exists", async () => {
    const session = makeSession([
      {
        match: (input) =>
          input.cmd === "git" &&
          JSON.stringify(input.args).includes("checkout"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "test" &&
          JSON.stringify(input.args).includes("bun.lockb"),
        result: {
          exitCode: 1,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "test" &&
          JSON.stringify(input.args).includes("bun.lock"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "which" && JSON.stringify(input.args).includes("bun"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "/usr/bin/bun\n" },
        },
      },
      {
        match: (input) =>
          input.cmd === "bun" && JSON.stringify(input.args).includes("install"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./implementation.step"
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
  });

  it("runs uv sync for python repos (frozen when uv.lock exists)", async () => {
    const session = makeSession([
      {
        match: (input) =>
          input.cmd === "git" &&
          JSON.stringify(input.args).includes("checkout"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "test" &&
          JSON.stringify(input.args).includes("uv.lock"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" && JSON.stringify(input.args).includes("sync"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
    ]);

    state.startSandboxJobSession.mockResolvedValueOnce(session);

    const { sandboxCheckoutImplementationRepo } = await import(
      "./implementation.step"
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
});

describe("planImplementationRun", () => {
  it("uses AI SDK structured output parsing with a mock model", async () => {
    const plan = {
      commitMessage: "feat: plan",
      planMarkdown: "## Plan",
      prBody: "body",
      prTitle: "title",
    };

    const model: MockLanguageModelV3 = createMockLanguageModelV3Text(
      JSON.stringify(plan),
    );

    state.createGateway.mockReturnValueOnce({
      languageModel: () => model,
    });

    const { planImplementationRun } = await import("./implementation.step");
    const res = await planImplementationRun({
      projectName: "Project",
      projectSlug: "project",
      repoName: "repo",
      repoOwner: "owner",
      runId: "run_1",
    });

    expect(res).toEqual(plan);
    // Ensure we didn't replace generateText itself.
    expect(typeof generateText).toBe("function");
  });
});

describe("applyImplementationPatch", () => {
  it("applies a patch, resolves commit SHA, and pushes", async () => {
    const sha = "9f8311cbf8746bc24d052cea5b9670a481eb9a52";
    const session = makeSession([
      {
        match: (input) => input.cmd === "chmod",
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" && JSON.stringify(input.args).includes("apply"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" &&
          JSON.stringify(input.args).includes("user.name"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" &&
          JSON.stringify(input.args).includes("user.email"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" && JSON.stringify(input.args).includes("commit"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" &&
          JSON.stringify(input.args).includes("rev-parse"),
        result: {
          exitCode: 0,
          transcript: { combined: sha, stderr: "", stdout: `${sha}\n` },
        },
      },
      {
        match: (input) =>
          input.cmd === "git" && JSON.stringify(input.args).includes("push"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
    ]);

    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { applyImplementationPatch } = await import("./implementation.step");
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
  });
});

describe("verifyImplementationRun", () => {
  it("verifies node repos by running lint/typecheck/test/build scripts", async () => {
    const session = makeSession([
      {
        match: (input) =>
          input.cmd === "which" && JSON.stringify(input.args).includes("bun"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "/usr/bin/bun\n" },
        },
      },
      {
        match: (input) =>
          input.cmd === "bun" && JSON.stringify(input.args).includes("lint"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "bun" &&
          JSON.stringify(input.args).includes("typecheck"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "bun" && JSON.stringify(input.args).includes("test"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "bun" && JSON.stringify(input.args).includes("build"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
    ]);
    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./implementation.step");
    await expect(
      verifyImplementationRun({
        projectId: "proj_1",
        repoKind: "node",
        repoPath: "/vercel/sandbox",
        runId: "run_1",
        sandboxId: "sb_1",
      }),
    ).resolves.toMatchObject({ kind: "node", ok: true });
  });

  it("verifies python repos using ruff, mypy fallback, and pytest", async () => {
    const session = makeSession([
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("ruff") &&
          JSON.stringify(input.args).includes("--version"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "ruff 0.0.0\n" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("ruff") &&
          JSON.stringify(input.args).includes("check"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("pyright") &&
          JSON.stringify(input.args).includes("--version"),
        result: {
          exitCode: 1,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("mypy") &&
          JSON.stringify(input.args).includes("--version"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "mypy 1.0\n" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("mypy") &&
          JSON.stringify(input.args).includes("run"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("pytest") &&
          JSON.stringify(input.args).includes("--version"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "pytest\n" },
        },
      },
      {
        match: (input) =>
          input.cmd === "uv" &&
          JSON.stringify(input.args).includes("pytest") &&
          !JSON.stringify(input.args).includes("--version"),
        result: {
          exitCode: 0,
          transcript: { combined: "", stderr: "", stdout: "" },
        },
      },
    ]);
    state.attachSandboxJobSession.mockResolvedValueOnce(session);

    const { verifyImplementationRun } = await import("./implementation.step");
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
});

describe("openImplementationPullRequest", () => {
  it("maps repo-ops PR data to workflow output", async () => {
    const { openImplementationPullRequest } = await import(
      "./implementation.step"
    );
    await expect(
      openImplementationPullRequest({
        base: "main",
        body: "body",
        head: "agent/project/run_1",
        owner: "owner",
        repo: "repo",
        title: "title",
      }),
    ).resolves.toMatchObject({
      prNumber: 1,
      prUrl: "https://example.com/pr/1",
    });
  });
});

describe("stopImplementationSandbox", () => {
  it("swallows sandbox lookup errors", async () => {
    state.getVercelSandbox.mockRejectedValueOnce(new Error("missing"));
    const { stopImplementationSandbox } = await import("./implementation.step");
    await expect(
      stopImplementationSandbox("sb_missing"),
    ).resolves.toBeUndefined();
  });

  it("best-effort stops the sandbox and swallows stop errors", async () => {
    state.getVercelSandbox.mockResolvedValueOnce({
      stop: vi.fn(async () => {
        throw new Error("already stopped");
      }),
    });
    const { stopImplementationSandbox } = await import("./implementation.step");
    await expect(stopImplementationSandbox("sb_1")).resolves.toBeUndefined();
  });
});
