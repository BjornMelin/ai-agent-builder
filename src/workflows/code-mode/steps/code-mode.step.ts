import "server-only";

import type { ToolSet, UIMessageChunk } from "ai";
import { stepCountIs, ToolLoopAgent, tool } from "ai";
import type { FileAdapter } from "ctx-zip";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getDefaultChatModel } from "@/lib/ai/gateway.server";
import { AppError } from "@/lib/core/errors";
import { listReposByProject } from "@/lib/data/repos.server";
import { env } from "@/lib/env";
import { isGitHubConfigured } from "@/lib/repo/github.client.server";
import {
  detectGitHubRepoRuntimeKind,
  type RepoRuntimeKind,
} from "@/lib/repo/repo-kind.server";
import type { CodeModeStreamEvent } from "@/lib/runs/code-mode-stream";
import {
  createCtxZipSandboxCodeMode,
  type VercelSandboxLike,
} from "@/lib/sandbox/ctxzip.server";
import { compactToolResults } from "@/lib/sandbox/ctxzip-compactor.server";
import {
  SANDBOX_NETWORK_POLICY_NONE,
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";
import { redactSandboxLog } from "@/lib/sandbox/redaction.server";
import { startSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";

const SANDBOX_WORKSPACE_ROOT = "/vercel/sandbox";

const budgetsSchema = z
  .strictObject({
    maxSteps: z.number().int().min(1).max(50).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(30 * 60_000)
      .optional(),
  })
  .optional();

const codeModeMetadataSchema = z.object({
  budgets: budgetsSchema,
  networkAccess: z.enum(["none", "restricted"]).optional(),
  origin: z.literal("code-mode"),
  prompt: z.string().min(1),
});

function nowTimestamp(): number {
  return Date.now();
}

function resolveSandboxCwd(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Default to /vercel/sandbox for relative paths.
  if (!trimmed.startsWith("/")) {
    if (trimmed.includes("..")) {
      throw new AppError("bad_request", 400, "Invalid cwd.");
    }
    return `${SANDBOX_WORKSPACE_ROOT}/${trimmed}`.replaceAll("//", "/");
  }

  if (!trimmed.startsWith(SANDBOX_WORKSPACE_ROOT)) {
    throw new AppError(
      "bad_request",
      400,
      `cwd must be within ${SANDBOX_WORKSPACE_ROOT}.`,
    );
  }
  if (trimmed.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid cwd.");
  }

  return trimmed;
}

function resolveSandboxPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }
  if (trimmed.startsWith("~")) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }

  if (trimmed.startsWith("/")) {
    if (!trimmed.startsWith(SANDBOX_WORKSPACE_ROOT)) {
      throw new AppError(
        "bad_request",
        400,
        `Path must be within ${SANDBOX_WORKSPACE_ROOT}.`,
      );
    }
    if (trimmed.includes("..")) {
      throw new AppError("bad_request", 400, "Invalid sandbox path.");
    }
    return trimmed;
  }

  if (trimmed.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid sandbox path.");
  }

  return `${SANDBOX_WORKSPACE_ROOT}/${trimmed}`.replaceAll("//", "/");
}

function rewriteSandboxArgsForWorkspace(cmd: string, args: readonly string[]) {
  if (args.length === 0) return args;

  const next = [...args];

  const rewriteAt = (index: number) => {
    const current = next[index];
    if (typeof current !== "string") return;
    next[index] = resolveSandboxPath(current);
  };

  switch (cmd) {
    case "ls": {
      // ctx-zip places the path as the final arg.
      rewriteAt(next.length - 1);
      break;
    }
    case "cat": {
      rewriteAt(0);
      break;
    }
    case "grep": {
      // Args end with: <pattern> <path>
      rewriteAt(next.length - 1);
      break;
    }
    case "find": {
      rewriteAt(0);
      break;
    }
    case "mkdir": {
      // Best-effort: the final arg is the path.
      rewriteAt(next.length - 1);
      break;
    }
    case "test": {
      // For `test -f <path>` or similar, rewrite the final arg.
      rewriteAt(next.length - 1);
      break;
    }
    default: {
      break;
    }
  }

  return next;
}

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[output truncated]`;
}

function redactToolCallArgs(args: readonly string[] | undefined): string[] {
  if (!args) return [];
  return args.map((arg) => redactSandboxLog(arg));
}

function redactStreamPayload(value: unknown): unknown {
  if (value === undefined) return undefined;

  if (typeof value === "string") {
    return redactSandboxLog(value);
  }

  try {
    const redacted = redactSandboxLog(JSON.stringify(value));
    // Preserve object shape for UI rendering when possible.
    return JSON.parse(redacted) as unknown;
  } catch {
    try {
      return redactSandboxLog(String(value));
    } catch {
      return "<redacted>";
    }
  }
}

type CodeModeStepResult = Readonly<{
  assistantText: string;
  jobId: string;
  prompt: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

/**
 * Execute the Code Mode agent inside a Vercel Sandbox job and stream progress.
 *
 * @param input - Workflow + run identity and output stream.
 * @returns Summary outputs for persistence/artifacts.
 */
export async function runCodeModeSession(
  input: Readonly<{
    runId: string;
    workflowRunId: string;
    writable: WritableStream<UIMessageChunk>;
  }>,
): Promise<CodeModeStepResult> {
  "use step";

  const db = getDb();
  const runRow = await db.query.runsTable.findFirst({
    columns: { id: true, metadata: true, projectId: true, status: true },
    where: eq(schema.runsTable.id, input.runId),
  });
  if (!runRow) {
    throw new AppError("not_found", 404, "Run not found.");
  }

  const parsedMeta = codeModeMetadataSchema.safeParse(runRow.metadata);
  if (!parsedMeta.success) {
    throw new AppError("bad_request", 400, "Invalid Code Mode run metadata.");
  }

  const prompt = parsedMeta.data.prompt;
  const networkAccess = parsedMeta.data.networkAccess ?? "restricted";
  const budgets = parsedMeta.data.budgets ?? {};
  const maxSteps = budgets.maxSteps ?? 12;
  const timeoutMs = budgets.timeoutMs ?? 10 * 60_000;

  const writer = input.writable.getWriter();
  const writeEvent = async (event: CodeModeStreamEvent) => {
    const chunk: UIMessageChunk = { data: event, type: "data-code-mode" };
    await writer.write(chunk);
  };

  try {
    await writeEvent({
      message: `Code Mode started (workflow: ${input.workflowRunId}).`,
      timestamp: nowTimestamp(),
      type: "status",
    });

    // Prefer cloning a connected repo when network access is enabled.
    const repos = await listReposByProject(runRow.projectId);
    const repo = repos.at(0) ?? null;

    const source =
      networkAccess === "restricted" && repo
        ? ({
            ...(repo.provider === "github" && env.github.token
              ? {
                  password: env.github.token,
                  username: "x-access-token",
                }
              : {}),
            depth: 1,
            revision: repo.defaultBranch,
            type: "git",
            url: repo.cloneUrl,
          } as const)
        : undefined;

    let repoKind: RepoRuntimeKind = "node";
    if (repo && repo.provider === "github" && isGitHubConfigured()) {
      const detected = await detectGitHubRepoRuntimeKind({
        owner: repo.owner,
        ref: repo.defaultBranch,
        repo: repo.name,
      });
      repoKind = detected.kind;
    }

    const networkPolicy =
      networkAccess === "restricted"
        ? repoKind === "python"
          ? SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT
          : SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT
        : SANDBOX_NETWORK_POLICY_NONE;

    const session = await startSandboxJobSession({
      jobType: "code_mode",
      metadata: {
        networkAccess,
        repoKind,
        ...(repo
          ? {
              repo: {
                defaultBranch: repo.defaultBranch,
                htmlUrl: repo.htmlUrl,
                name: repo.name,
                owner: repo.owner,
                provider: repo.provider,
              },
            }
          : {}),
      },
      networkPolicy,
      projectId: runRow.projectId,
      runId: runRow.id,
      runtime: repoKind === "python" ? "python3.13" : "node24",
      ...(source ? { source } : {}),
      timeoutMs: Math.min(Math.max(timeoutMs, 10_000), 30 * 60_000),
      vcpus: 2,
    });

    await writeEvent({
      message: `Sandbox job: ${session.job.id}`,
      timestamp: nowTimestamp(),
      type: "status",
    });

    const compactionSessionId = `code-mode:${input.runId}`;

    const sandboxLike: VercelSandboxLike = {
      runCommand: async ({ cmd, args }) => {
        const safeCmd = cmd.trim();
        const safeArgs = rewriteSandboxArgsForWorkspace(safeCmd, args ?? []);
        const result = await session.runCommand({
          args: safeArgs,
          cmd: safeCmd,
          cwd: SANDBOX_WORKSPACE_ROOT,
          policy: "code_mode",
        });
        return {
          exitCode: result.exitCode,
          stderr: async () => result.transcript.stderr,
          stdout: async () => result.transcript.stdout,
        };
      },
      sandboxId: session.sandbox.sandboxId,
      stop: async () => {},
      writeFiles: async (files) => {
        const rewritten = files.map((file) => ({
          content: file.content,
          path: resolveSandboxPath(file.path),
        }));
        await session.sandbox.writeFiles(rewritten);
      },
    };

    let ctxZip: Awaited<ReturnType<typeof createCtxZipSandboxCodeMode>> | null =
      null;
    let compactionStorage: FileAdapter | null = null;
    const ctxZipTools: ToolSet = {};

    try {
      ctxZip = await createCtxZipSandboxCodeMode({
        sandbox: sandboxLike,
        stopOnCleanup: false,
        workspacePath: SANDBOX_WORKSPACE_ROOT,
      });
      compactionStorage = ctxZip.manager.getFileAdapter({
        sessionId: compactionSessionId,
      });
      const catTool = ctxZip.tools.sandbox_cat;
      if (catTool) ctxZipTools.sandbox_cat = catTool;
      const findTool = ctxZip.tools.sandbox_find;
      if (findTool) ctxZipTools.sandbox_find = findTool;
      const grepTool = ctxZip.tools.sandbox_grep;
      if (grepTool) ctxZipTools.sandbox_grep = grepTool;
      const lsTool = ctxZip.tools.sandbox_ls;
      if (lsTool) ctxZipTools.sandbox_ls = lsTool;
      await writeEvent({
        message: "ctx-zip compaction enabled (write tool results to sandbox).",
        timestamp: nowTimestamp(),
        type: "status",
      });
    } catch (err) {
      // Code Mode remains usable without ctx-zip, but compaction will be less effective.
      ctxZip = null;
      compactionStorage = null;

      const message =
        err instanceof Error ? err.message : "Failed to enable ctx-zip.";
      await writeEvent({
        message: `ctx-zip compaction disabled: ${message}`,
        timestamp: nowTimestamp(),
        type: "status",
      });
    }

    const sandboxRunTool = tool({
      description:
        "Run an allowlisted command inside the sandbox repo workspace. Prefer Bun scripts (bun run lint/test/build) for project checks. Do not use curl/wget. Always keep cwd within /vercel/sandbox.",
      async execute({ cmd, args, cwd }) {
        const safeCmd = cmd.trim();
        const safeArgs = args ?? [];
        const resolvedCwd = resolveSandboxCwd(cwd);

        await writeEvent({
          input: {
            args: redactToolCallArgs(safeArgs),
            cmd: safeCmd,
            ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
          },
          timestamp: nowTimestamp(),
          toolName: "sandbox_run",
          type: "tool-call",
        });

        const result = await session.runCommand({
          args: safeArgs,
          cmd: safeCmd,
          ...(resolvedCwd ? { cwd: resolvedCwd } : {}),
          onLog: async (entry) => {
            await writeEvent({
              data: entry.data,
              stream: entry.stream,
              timestamp: nowTimestamp(),
              type: "log",
            });
          },
          policy: "code_mode",
        });

        await writeEvent({
          output: { exitCode: result.exitCode },
          timestamp: nowTimestamp(),
          toolName: "sandbox_run",
          type: "tool-result",
        });

        const combinedTail = limitText(result.transcript.combined, 50_000);
        return {
          exitCode: result.exitCode,
          transcriptTail: redactSandboxLog(combinedTail),
        };
      },
      inputSchema: z.object({
        args: z.array(z.string().min(1)).max(64).optional(),
        cmd: z.string().min(1),
        cwd: z.string().min(1).optional(),
      }),
    });

    const agent = new ToolLoopAgent({
      instructions: [
        "You are Code Mode, an AI assistant operating inside a locked-down Vercel Sandbox VM.",
        "You can run allowlisted commands via the sandbox_run tool, and you should be explicit about what you run and why.",
        "Large tool outputs are automatically compacted to files in the sandbox. Use sandbox_ls/sandbox_cat/sandbox_grep/sandbox_find to retrieve referenced results on-demand.",
        "Default to read-only inspection first (ls, rg, cat) before running heavier commands.",
        "Never attempt to fetch secrets or exfiltrate data.",
        "When you complete the task, summarize what you did and include command outputs when relevant.",
      ].join("\n"),
      model: getDefaultChatModel(),
      onStepFinish: async (step) => {
        // Best-effort: emit tool summaries without duplicating the sandbox_run stream.
        for (const toolCall of step.toolCalls) {
          if (toolCall.toolName === "sandbox_run") continue;
          await writeEvent({
            input: redactStreamPayload(toolCall.input),
            timestamp: nowTimestamp(),
            toolName: toolCall.toolName,
            type: "tool-call",
          });
        }
        for (const toolResult of step.toolResults) {
          if (toolResult.toolName === "sandbox_run") continue;
          await writeEvent({
            output: redactStreamPayload(toolResult.output),
            timestamp: nowTimestamp(),
            toolName: toolResult.toolName,
            type: "tool-result",
          });
        }
      },
      prepareStep: async ({ messages }) => {
        // Keep the agent loop within context budgets even with tool-heavy output.
        const boundary = { count: 8, type: "keep-last" } as const;
        let compacted: typeof messages;
        if (compactionStorage) {
          try {
            compacted = await compactToolResults(messages, {
              boundary,
              sessionId: compactionSessionId,
              storage: compactionStorage,
              strategy: "write-tool-results-to-file",
              toolResultSerializer: (value) =>
                redactSandboxLog(JSON.stringify(value, null, 2)),
            });
          } catch {
            // If compaction fails (storage issues, sandbox hiccups, etc.), prefer
            // preserving tool results to avoid degrading correctness. We still
            // cap history size so context does not grow unbounded.
            compacted =
              messages.length > boundary.count
                ? messages.slice(messages.length - boundary.count)
                : messages;
          }
        } else {
          compacted = await compactToolResults(messages, {
            boundary,
            strategy: "drop-tool-results",
          });
        }
        return { messages: compacted };
      },
      stopWhen: stepCountIs(maxSteps),
      tools: { ...ctxZipTools, sandbox_run: sandboxRunTool },
    });

    let assistantText = "";
    let exitCode = 0;
    let failure: unknown | null = null;

    let finalizedJobId: string | null = null;
    let transcriptBlobRef: string | null = null;
    let transcriptTruncated = false;

    try {
      const stream = await agent.stream({
        prompt,
        timeout: {
          totalMs: Math.min(Math.max(timeoutMs, 10_000), 30 * 60_000),
        },
      });

      for await (const delta of stream.textStream) {
        const redacted = redactSandboxLog(delta);
        assistantText += redacted;
        if (assistantText.length > 200_000) {
          assistantText = assistantText.slice(assistantText.length - 200_000);
        }
        await writeEvent({
          textDelta: redacted,
          timestamp: nowTimestamp(),
          type: "assistant-delta",
        });
      }
    } catch (err) {
      exitCode = 1;
      failure = err;
      const message = err instanceof Error ? err.message : "Code Mode failed.";
      await writeEvent({
        message,
        timestamp: nowTimestamp(),
        type: "status",
      });
    } finally {
      try {
        await ctxZip?.manager.cleanup();
      } catch {
        // Best effort only.
      }

      const finalized = await session.finalize({
        exitCode,
        status: exitCode === 0 ? "succeeded" : "failed",
      });

      finalizedJobId = finalized.job.id;
      transcriptBlobRef = finalized.job.transcriptBlobRef;
      transcriptTruncated = finalized.transcript.truncated;

      await writeEvent({
        exitCode,
        timestamp: nowTimestamp(),
        type: "exit",
      });
    }

    // Ensure assistant text can't leak unredacted tokens (defense in depth).
    assistantText = redactSandboxLog(assistantText);

    if (failure) {
      throw failure;
    }

    if (!finalizedJobId) {
      throw new AppError("internal", 500, "Sandbox job did not finalize.");
    }

    return {
      assistantText,
      jobId: finalizedJobId,
      prompt,
      transcriptBlobRef,
      transcriptTruncated,
    };
  } finally {
    try {
      writer.releaseLock();
    } catch {
      // Ignore if the lock is already released elsewhere.
    }
  }
}
