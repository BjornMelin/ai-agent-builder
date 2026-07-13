import "server-only";

import type { UIMessageChunk } from "ai";
import { isStepCount, pruneMessages, ToolLoopAgent, tool } from "ai";
import { eq } from "drizzle-orm";
import { getStepMetadata } from "workflow";
import { z } from "zod";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getDefaultChatModel } from "@/lib/ai/gateway.server";
import {
  listAvailableSkillsForProject,
  loadSkillForProject,
  readSkillFileForProject,
} from "@/lib/ai/skills/index.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import { AppError } from "@/lib/core/errors";
import { listReposByProject } from "@/lib/data/repos.server";
import { env } from "@/lib/env";
import { isGitHubConfigured } from "@/lib/repo/github.client.server";
import {
  detectGitHubRepoRuntimeKind,
  type RepoRuntimeKind,
} from "@/lib/repo/repo-kind.server";
import {
  SANDBOX_NETWORK_POLICY_NONE,
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";
import { redactSandboxLog } from "@/lib/sandbox/redaction.server";
import { startSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";
import { nowTimestamp } from "@/workflows/_shared/workflow-run-utils";
import {
  type CodeModeStreamEventInput,
  createCodeModeStreamEvent,
} from "@/workflows/_shared/workflow-stream-events";
import { chatToolSkillMetadataSchema } from "@/workflows/chat/tool-context";
import {
  limitText,
  redactStreamPayload,
  redactToolCallArgs,
} from "@/workflows/code-mode/steps/code-mode/redaction";
import {
  resolveSandboxCwd,
  resolveSandboxPath,
  SANDBOX_WORKSPACE_ROOT,
} from "@/workflows/code-mode/steps/code-mode/sandbox-paths";
import { parseCodeModeRunMetadata } from "@/workflows/code-mode/steps/code-mode/session-metadata";

type CodeModeStepResult = Readonly<{
  assistantText: string;
  jobId: string;
  prompt: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

type PersistedRunStatus = (typeof schema.runsTable.$inferSelect)["status"];

/**
 * Read the authoritative persisted status for a Code Mode run.
 *
 * @param runId - Durable run ID.
 * @returns Persisted run status.
 * @throws AppError - When the run no longer exists.
 */
export async function getCodeModeRunStatus(
  runId: string,
): Promise<PersistedRunStatus> {
  "use step";

  const db = getDb();
  const row = await db.query.runsTable.findFirst({
    columns: { status: true },
    where: eq(schema.runsTable.id, runId),
  });
  if (!row) {
    throw new AppError("not_found", 404, "Run not found.");
  }
  return row.status;
}

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
    columns: {
      cancelRequestedAt: true,
      id: true,
      metadata: true,
      projectId: true,
      status: true,
    },
    where: eq(schema.runsTable.id, input.runId),
  });
  if (!runRow) {
    throw new AppError("not_found", 404, "Run not found.");
  }
  if (runRow.cancelRequestedAt || runRow.status === "canceled") {
    throw new AppError(
      "sandbox_job_canceled",
      409,
      "Code Mode run cancellation was requested.",
    );
  }
  if (runRow.status !== "running") {
    throw new AppError(
      "code_mode_run_not_active",
      409,
      `Code Mode run is ${runRow.status}.`,
    );
  }

  const parsedMeta = parseCodeModeRunMetadata(runRow.metadata);
  const prompt = parsedMeta.prompt;
  const networkAccess = parsedMeta.networkAccess ?? "none";
  const budgets = parsedMeta.budgets ?? {};
  const maxSteps = budgets.maxSteps ?? 12;
  const timeoutMs = budgets.timeoutMs ?? 10 * 60_000;

  const writer = input.writable.getWriter();
  const writeEvent = async (event: CodeModeStreamEventInput) => {
    const chunk: UIMessageChunk = {
      data: createCodeModeStreamEvent(event),
      type: "data-workflow",
    };
    await writer.write(chunk);
  };

  try {
    await writeEvent({
      message: `Code Mode started (workflow: ${input.workflowRunId}).`,
      timestamp: nowTimestamp(),
      type: "status",
    });

    // Prefer cloning a connected repo when network access is enabled.
    const [availableSkills, repos] = await Promise.all([
      listAvailableSkillsForProject(runRow.projectId),
      listReposByProject(runRow.projectId),
    ]);
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

    const { stepId: provisioningKey } = getStepMetadata();
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
      provisioningKey,
      runId: runRow.id,
      runtime: repoKind === "python" ? "python3.13" : "node24",
      ...(source ? { source } : {}),
      timeoutMs: Math.min(Math.max(timeoutMs, 10_000), 30 * 60_000),
      vcpus: 2,
    });

    let assistantText = "";
    const ASSISTANT_TEXT_LIMIT = 200_000;
    const ASSISTANT_TEXT_TRIM_THRESHOLD = 220_000;
    let executionFailed = false;
    let failure: unknown;
    let exitCode = 1;
    let finalizationFailed = false;
    let finalizationFailure: unknown;
    let finalizedJobId: string | null = null;
    let transcriptBlobRef: string | null = null;
    let transcriptTruncated = false;

    try {
      await writeEvent({
        message: `Sandbox job: ${session.job.id}`,
        timestamp: nowTimestamp(),
        type: "status",
      });

      const runExplorationCommand = async (
        cmd: "cat" | "find" | "grep" | "ls",
        args: readonly string[],
      ) => {
        const result = await session.runCommand({
          args,
          cmd,
          cwd: SANDBOX_WORKSPACE_ROOT,
          policy: "code_mode",
        });
        return {
          exitCode: result.exitCode,
          output: redactSandboxLog(
            limitText(result.transcript.combined, 50_000),
          ),
        };
      };

      const sandboxLsTool = tool({
        description: "List a path inside the sandbox workspace.",
        async execute({ path }) {
          return await runExplorationCommand("ls", [
            "-la",
            path ? resolveSandboxPath(path) : SANDBOX_WORKSPACE_ROOT,
          ]);
        },
        inputSchema: z.strictObject({
          path: z.string().min(1).optional(),
        }),
      });

      const sandboxCatTool = tool({
        description: "Read a text file inside the sandbox workspace.",
        async execute({ path }) {
          return await runExplorationCommand("cat", [resolveSandboxPath(path)]);
        },
        inputSchema: z.strictObject({
          path: z.string().min(1),
        }),
      });

      const sandboxGrepTool = tool({
        description:
          "Recursively search file contents inside the sandbox workspace.",
        async execute({ path, pattern }) {
          return await runExplorationCommand("grep", [
            "-R",
            "-n",
            "-I",
            "--exclude-dir=.git",
            "--",
            pattern,
            path ? resolveSandboxPath(path) : SANDBOX_WORKSPACE_ROOT,
          ]);
        },
        inputSchema: z.strictObject({
          path: z.string().min(1).optional(),
          pattern: z.string().min(1),
        }),
      });

      const sandboxFindTool = tool({
        description: "Find files by name inside the sandbox workspace.",
        async execute({ maxDepth, name, path }) {
          return await runExplorationCommand("find", [
            path ? resolveSandboxPath(path) : SANDBOX_WORKSPACE_ROOT,
            "-maxdepth",
            String(maxDepth),
            "-type",
            "f",
            ...(name ? ["-name", name] : []),
          ]);
        },
        inputSchema: z.strictObject({
          maxDepth: z.number().int().min(1).max(8).default(4),
          name: z.string().min(1).optional(),
          path: z.string().min(1).optional(),
        }),
      });

      const sandboxRunTool = tool({
        description:
          "Run an allowlisted command inside the sandbox workspace. Prefer read-only inspection first. Avoid package managers and arbitrary downloads. Always keep cwd within /vercel/sandbox.",
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
        inputSchema: z.strictObject({
          args: z.array(z.string().min(1)).max(64).optional(),
          cmd: z.string().min(1),
          cwd: z.string().min(1).optional(),
        }),
      });

      const codeModeCallOptionsSchema = z.strictObject({
        skills: z.array(chatToolSkillMetadataSchema),
      });

      const skillToolContextSchema = z.strictObject({
        projectId: z.string().min(1),
      });

      const skillsLoadTool = tool({
        contextSchema: skillToolContextSchema,
        description: "Load a skill to get specialized instructions.",
        async execute({ name }, { context }) {
          return await loadSkillForProject({
            name,
            projectId: context.projectId,
          });
        },
        inputSchema: z.strictObject({
          name: z.string().min(1),
        }),
      });

      const skillsReadFileTool = tool({
        contextSchema: skillToolContextSchema,
        description:
          "Read a file referenced by a repo-bundled skill. Path must be relative to the skill directory.",
        async execute({ name, path }, { context }) {
          return await readSkillFileForProject({
            name,
            path,
            projectId: context.projectId,
          });
        },
        inputSchema: z.strictObject({
          name: z.string().min(1),
          path: z.string().min(1),
        }),
      });

      const agent = new ToolLoopAgent({
        callOptionsSchema: codeModeCallOptionsSchema,
        instructions: [
          "You are Code Mode, an AI assistant operating inside a locked-down Vercel Sandbox VM.",
          "You can run allowlisted commands via the sandbox_run tool, and you should be explicit about what you run and why.",
          "Use sandbox_ls, sandbox_cat, sandbox_grep, and sandbox_find for focused read-only exploration before broader commands.",
          "Default to read-only inspection first (ls, rg, cat) before running heavier commands.",
          "Do not run builds or installs in Code Mode. Use Implementation Runs for lint/typecheck/test/build workflows.",
          "Never attempt to fetch secrets or exfiltrate data.",
          "When you complete the task, summarize what you did and include command outputs when relevant.",
        ].join("\n"),
        maxOutputTokens: 2048,
        model: getDefaultChatModel(),
        onStepEnd: async (step) => {
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
        prepareCall: ({ options, ...settings }) => ({
          ...settings,
          instructions: [
            settings.instructions,
            buildSkillsPrompt(options.skills),
          ].join("\n\n"),
        }),
        prepareStep: ({ messages }) => ({
          messages: pruneMessages({
            messages,
            reasoning: "before-last-message",
            toolCalls: "before-last-8-messages",
          }),
        }),
        stopWhen: isStepCount(maxSteps),
        tools: {
          sandbox_cat: sandboxCatTool,
          sandbox_find: sandboxFindTool,
          sandbox_grep: sandboxGrepTool,
          sandbox_ls: sandboxLsTool,
          sandbox_run: sandboxRunTool,
          "skills.load": skillsLoadTool,
          "skills.readFile": skillsReadFileTool,
        },
        toolsContext: {
          "skills.load": { projectId: runRow.projectId },
          "skills.readFile": { projectId: runRow.projectId },
        },
      });

      const stream = await agent.stream({
        options: {
          skills: availableSkills,
        },
        prompt,
        timeout: {
          totalMs: Math.min(Math.max(timeoutMs, 10_000), 30 * 60_000),
        },
      });

      for await (const delta of stream.textStream) {
        const redacted = redactSandboxLog(delta);
        assistantText += redacted;
        if (assistantText.length > ASSISTANT_TEXT_TRIM_THRESHOLD) {
          assistantText = assistantText.slice(
            assistantText.length - ASSISTANT_TEXT_LIMIT,
          );
        }
        await writeEvent({
          textDelta: redacted,
          timestamp: nowTimestamp(),
          type: "assistant-delta",
        });
      }
      exitCode = 0;
    } catch (err) {
      executionFailed = true;
      failure = err;
      const message = err instanceof Error ? err.message : "Code Mode failed.";
      try {
        await writeEvent({
          message,
          timestamp: nowTimestamp(),
          type: "status",
        });
      } catch {
        // The original session failure remains authoritative.
      }
    } finally {
      try {
        const finalizedStatus = exitCode === 0 ? "succeeded" : "failed";
        const finalized = await session.finalize({
          exitCode,
          status: finalizedStatus,
        });
        if (finalized.job.status !== finalizedStatus) {
          finalizationFailed = true;
          finalizationFailure = new AppError(
            finalized.job.status === "canceling" ||
              finalized.job.status === "canceled"
              ? "sandbox_job_canceled"
              : "sandbox_job_not_active",
            409,
            `Sandbox job ended as ${finalized.job.status}.`,
            executionFailed ? failure : undefined,
          );
        } else {
          finalizedJobId = finalized.job.id;
          transcriptBlobRef = finalized.job.transcriptBlobRef;
          transcriptTruncated = finalized.transcript.truncated;
        }
      } catch (err) {
        finalizationFailed = true;
        finalizationFailure = err;
      }
    }

    // Ensure assistant text can't leak unredacted tokens (defense in depth).
    assistantText = redactSandboxLog(assistantText);

    if (finalizationFailed) {
      throw finalizationFailure;
    }

    if (executionFailed) {
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
