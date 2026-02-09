import { createWritableCollector } from "@tests/utils/streams";
import type { stepCountIs, Tool, UIMessageChunk } from "ai";
import { mockValues } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeModeStreamEvent } from "@/lib/runs/code-mode-stream";
import {
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";

type RunCommandResult = Readonly<{
  exitCode: number;
  transcript: Readonly<{ combined: string; stderr: string; stdout: string }>;
}>;

const state = vi.hoisted(() => ({
  compactToolResults: vi.fn(),
  createCtxZipSandboxCodeMode: vi.fn(),
  detectGitHubRepoRuntimeKind: vi.fn(),
  getDb: vi.fn(),
  getDefaultChatModel: vi.fn(),
  isGitHubConfigured: vi.fn(),
  listReposByProject: vi.fn(),
  redactSandboxLog: vi.fn((value: string) => value),
  startSandboxJobSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    github: {
      token: "gh_token",
    },
  },
}));

vi.mock("@/db/client", () => ({
  getDb: () => state.getDb(),
}));

vi.mock("@/lib/data/repos.server", () => ({
  listReposByProject: (...args: unknown[]) => state.listReposByProject(...args),
}));

vi.mock("@/lib/repo/github.client.server", () => ({
  isGitHubConfigured: (...args: unknown[]) => state.isGitHubConfigured(...args),
}));

vi.mock("@/lib/repo/repo-kind.server", () => ({
  detectGitHubRepoRuntimeKind: (...args: unknown[]) =>
    state.detectGitHubRepoRuntimeKind(...args),
}));

vi.mock("@/lib/sandbox/redaction.server", () => ({
  redactSandboxLog: (value: string) => state.redactSandboxLog(value),
}));

vi.mock("@/lib/sandbox/ctxzip-compactor.server", () => ({
  compactToolResults: (...args: unknown[]) => state.compactToolResults(...args),
}));

vi.mock("@/lib/sandbox/ctxzip.server", () => ({
  createCtxZipSandboxCodeMode: (...args: unknown[]) =>
    state.createCtxZipSandboxCodeMode(...args),
}));

vi.mock("@/lib/ai/gateway.server", () => ({
  getDefaultChatModel: (...args: unknown[]) =>
    state.getDefaultChatModel(...args),
}));

vi.mock("@/lib/sandbox/sandbox-runner.server", () => ({
  startSandboxJobSession: (...args: unknown[]) =>
    state.startSandboxJobSession(...args),
}));

vi.mock("ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("ai")>();

  class ToolLoopAgentMock {
    public constructor(
      private readonly settings: Readonly<{
        onStepFinish?: (step: {
          toolCalls: Array<{ toolName: string; input: unknown }>;
          toolResults: Array<{ toolName: string; output: unknown }>;
        }) => Promise<void>;
        prepareStep?: (input: {
          messages: unknown[];
        }) => Promise<{ messages: unknown[] }>;
        stopWhen?: ReturnType<typeof stepCountIs>;
        tools: Record<string, Tool>;
      }>,
    ) {}

    public async stream(): Promise<{ textStream: AsyncIterable<string> }> {
      // Exercise compaction path.
      await this.settings.prepareStep?.({
        messages: [{ content: "hi", role: "user" }],
      });

      // Exercise sandbox_run tool cwd validation and event emission.
      const sandboxRun = this.settings.tools.sandbox_run;
      if (sandboxRun) {
        try {
          await sandboxRun.execute?.(
            {
              args: ["-la", "/vercel/sandbox"],
              cmd: "ls",
              cwd: "repo",
            },
            { messages: [], toolCallId: "sandbox_ls_1" },
          );
        } catch {
          // ignore
        }
        try {
          await sandboxRun.execute?.(
            {
              args: ["-la", "/vercel/sandbox"],
              cmd: "ls",
              cwd: "/etc",
            },
            { messages: [], toolCallId: "sandbox_ls_2" },
          );
        } catch {
          // ignore
        }
      }

      // Exercise onStepFinish tool-call/result emission.
      await this.settings.onStepFinish?.({
        toolCalls: [
          { input: { path: "/vercel/sandbox" }, toolName: "sandbox_ls" },
        ],
        toolResults: [{ output: { ok: true }, toolName: "sandbox_ls" }],
      });

      const next = mockValues("hello", " world");
      async function* gen() {
        yield next();
        yield next();
      }

      return { textStream: gen() };
    }
  }

  return {
    ...mod,
    ToolLoopAgent: ToolLoopAgentMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.getDefaultChatModel.mockReturnValue({ kind: "model" });
  state.isGitHubConfigured.mockReturnValue(true);
  state.listReposByProject.mockResolvedValue([
    {
      cloneUrl: "https://example.com/repo.git",
      createdAt: new Date(0).toISOString(),
      defaultBranch: "main",
      htmlUrl: "https://example.com/repo",
      id: "repo_1",
      name: "repo",
      owner: "owner",
      projectId: "proj_1",
      provider: "github",
      updatedAt: new Date(0).toISOString(),
    },
  ]);
  state.detectGitHubRepoRuntimeKind.mockResolvedValue({
    evidence: {
      hasPackageJson: false,
      hasPyprojectToml: true,
      hasRequirementsTxt: false,
    },
    kind: "python",
  });
  state.compactToolResults.mockImplementation(
    async (messages: unknown[]) => messages,
  );

  const runCommand = vi.fn(
    async (input: Record<string, unknown>): Promise<RunCommandResult> => {
      const onLog = input.onLog as
        | undefined
        | ((entry: {
            stream: "stdout" | "stderr";
            data: string;
          }) => Promise<void>);
      if (onLog) {
        await onLog({ data: "log", stream: "stdout" });
      }
      return {
        exitCode: 0,
        transcript: { combined: "ok", stderr: "", stdout: "ok" },
      };
    },
  );

  const session = {
    finalize: vi.fn(async ({ exitCode }: { exitCode: number }) => ({
      job: { id: "job_final", transcriptBlobRef: "blob_1" },
      transcript: { truncated: false },
      ...(exitCode === 0 ? {} : {}),
    })),
    job: { id: "job_1" },
    runCommand,
    sandbox: {
      sandboxId: "sb_1",
      stop: vi.fn(async () => {}),
      writeFiles: vi.fn(async () => {}),
    },
  };

  state.startSandboxJobSession.mockResolvedValue(session);

  state.createCtxZipSandboxCodeMode.mockImplementation(
    async (input: unknown) => {
      const sandbox = (
        input as {
          sandbox: {
            runCommand: (input: {
              cmd: string;
              args?: string[];
            }) => Promise<unknown>;
          };
        }
      ).sandbox;
      // Trigger rewriteSandboxArgsForWorkspace() via sandboxLike wrapper.
      await sandbox.runCommand({ args: ["foo.txt"], cmd: "cat" });
      return {
        manager: {
          cleanup: vi.fn(async () => {}),
          getFileAdapter: () => ({ kind: "adapter" }),
        },
        tools: {},
      };
    },
  );

  state.getDb.mockReturnValue({
    query: {
      runsTable: {
        findFirst: vi.fn(async () => ({
          id: "run_1",
          metadata: {
            budgets: { maxSteps: 2 },
            networkAccess: "restricted",
            origin: "code-mode",
            prompt: "Say hi",
          },
          projectId: "proj_1",
          status: "pending",
        })),
      },
    },
  });
});

describe("runCodeModeSession", () => {
  it("throws not_found when the run is missing", async () => {
    state.getDb.mockReturnValueOnce({
      query: { runsTable: { findFirst: vi.fn(async () => null) } },
    });
    const { runCodeModeSession } = await import("./code-mode.step");

    const { writable } = createWritableCollector<UIMessageChunk>();
    await expect(
      runCodeModeSession({ runId: "missing", workflowRunId: "wf_1", writable }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("throws bad_request when metadata is invalid", async () => {
    state.getDb.mockReturnValueOnce({
      query: {
        runsTable: {
          findFirst: vi.fn(async () => ({
            id: "run_1",
            metadata: { prompt: "" },
            projectId: "proj_1",
            status: "pending",
          })),
        },
      },
    });
    const { runCodeModeSession } = await import("./code-mode.step");

    const { writable } = createWritableCollector<UIMessageChunk>();
    await expect(
      runCodeModeSession({ runId: "run_1", workflowRunId: "wf_1", writable }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("runs the agent loop, emits stream events, and returns a summary", async () => {
    const { runCodeModeSession } = await import("./code-mode.step");

    const { writable, writes } = createWritableCollector<UIMessageChunk>();
    const res = await runCodeModeSession({
      runId: "run_1",
      workflowRunId: "wf_1",
      writable,
    });

    expect(res).toMatchObject({
      jobId: "job_final",
      prompt: "Say hi",
      transcriptBlobRef: "blob_1",
      transcriptTruncated: false,
    });
    expect(res.assistantText).toContain("hello");

    // Assert we picked the python policy/runtime when python markers exist.
    expect(state.startSandboxJobSession).toHaveBeenCalledWith(
      expect.objectContaining({
        networkPolicy: SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
        runtime: "python3.13",
      }),
    );

    // Ensure we exercised path rewriting for ctx-zip's `cat` call.
    const session = await state.startSandboxJobSession.mock.results[0]?.value;
    const calls = (session?.runCommand as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      calls.some((c: unknown[]) =>
        JSON.stringify(c[0]).includes("/vercel/sandbox/foo.txt"),
      ),
    ).toBe(true);

    // Stream events should include status + assistant deltas + exit.
    type CodeModeDataChunk = Readonly<{
      type: "data-code-mode";
      data: CodeModeStreamEvent;
      id?: string;
      transient?: boolean;
    }>;

    const dataChunks = writes.filter(
      (c): c is CodeModeDataChunk => c.type === "data-code-mode",
    );
    expect(dataChunks.some((c) => c.data.type === "status")).toBe(true);
    expect(dataChunks.some((c) => c.data.type === "assistant-delta")).toBe(
      true,
    );
    expect(dataChunks.some((c) => c.data.type === "exit")).toBe(true);
  });

  it("selects node policies when node is detected", async () => {
    state.detectGitHubRepoRuntimeKind.mockResolvedValueOnce({
      evidence: {
        hasPackageJson: true,
        hasPyprojectToml: false,
        hasRequirementsTxt: false,
      },
      kind: "node",
    });

    const { runCodeModeSession } = await import("./code-mode.step");
    const { writable } = createWritableCollector<UIMessageChunk>();
    await runCodeModeSession({
      runId: "run_1",
      workflowRunId: "wf_1",
      writable,
    });

    expect(state.startSandboxJobSession).toHaveBeenCalledWith(
      expect.objectContaining({
        networkPolicy: SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
        runtime: "node24",
      }),
    );
  });
});
