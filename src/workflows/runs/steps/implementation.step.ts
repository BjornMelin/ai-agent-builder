import "server-only";

import {
  createGateway,
  type GatewayModelId,
  Output,
  stepCountIs,
  type ToolExecutionOptions,
  ToolLoopAgent,
  type ToolSet,
  tool,
} from "ai";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  listAvailableSkillsForProject,
  loadSkillForProject,
  readSkillFileForProject,
} from "@/lib/ai/skills/index.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import type { SkillMetadata } from "@/lib/ai/skills/types";
import {
  context7QueryDocs,
  context7ResolveLibraryId,
} from "@/lib/ai/tools/mcp-context7.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import {
  detectGitHubRepoRuntimeKindStrict,
  type RepoRuntimeKind,
} from "@/lib/repo/repo-kind.server";
import { createOrGetPullRequest } from "@/lib/repo/repo-ops.server";
import {
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";
import { getVercelSandbox } from "@/lib/sandbox/sandbox-client.server";
import {
  attachSandboxJobSession,
  startSandboxJobSession,
} from "@/lib/sandbox/sandbox-runner.server";
import type { SandboxTranscript } from "@/lib/sandbox/transcript.server";

const SANDBOX_REPO_ROOT = "/vercel/sandbox";

function extractGitShaFromTranscript(transcript: SandboxTranscript): string {
  const lines = transcript.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line) continue;
    if (/^[0-9a-f]{7,40}$/i.test(line)) return line;
  }

  return "";
}

function assertGitHubToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new AppError("env_invalid", 500, "Invalid GITHUB_TOKEN.");
  }
  return trimmed;
}

/**
 * Preflight outputs for implementation runs (no secrets).
 */
export type ImplementationPreflight = Readonly<{
  ok: true;
  aiGatewayBaseUrl: string;
  aiGatewayChatModel: string;
  sandboxAuth: "oidc" | "token";
  githubConfigured: true;
}>;

/**
 * Implementation run repo context (non-secret).
 */
export type ImplementationRepoContext = Readonly<{
  projectId: string;
  projectName: string;
  projectSlug: string;
  repoId: string;
  provider: "github";
  repoKind: RepoRuntimeKind;
  owner: string;
  name: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
  branchName: string;
}>;

/**
 * Sandbox checkout outputs for implementation runs (non-secret).
 */
export type ImplementationSandboxCheckout = Readonly<{
  sandboxId: string;
  repoPath: string;
  branchName: string;
  baseBranch: string;
  sandboxJobId: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

/**
 * Plan outputs produced by the planner LLM call.
 */
export type ImplementationPlan = Readonly<{
  planMarkdown: string;
  prTitle: string;
  prBody: string;
  commitMessage: string;
}>;

/**
 * Patch application outputs (commit identity only).
 */
export type ImplementationPatchResult = Readonly<{
  branchName: string;
  commitSha: string;
  addedFilePath: string;
  sandboxJobId: string;
  transcriptBlobRef: string | null;
  transcriptTruncated: boolean;
}>;

/**
 * Verification outputs for the full suite.
 */
export type ImplementationVerifyResult =
  | Readonly<{
      kind: "node";
      ok: true;
      lint: Readonly<{ exitCode: number }>;
      typecheck: Readonly<{ exitCode: number }>;
      test: Readonly<{ exitCode: number }>;
      build: Readonly<{ exitCode: number }>;
      sandboxJobId: string;
      transcriptBlobRef: string | null;
      transcriptTruncated: boolean;
    }>
  | Readonly<{
      kind: "python";
      ok: true;
      lint: Readonly<{ exitCode: number }>;
      typecheck: Readonly<{ exitCode: number }>;
      typecheckTool: "pyright" | "mypy";
      test: Readonly<{ exitCode: number }>;
      sandboxJobId: string;
      transcriptBlobRef: string | null;
      transcriptTruncated: boolean;
    }>;

/**
 * Pull request outputs persisted for the run.
 */
export type ImplementationPullRequestResult = Readonly<{
  prNumber: number;
  prUrl: string;
  prTitle: string;
  head: string;
  base: string;
}>;

/**
 * Validate required env + integrations for implementation runs.
 *
 * @returns Preflight metadata (no secrets).
 */
export async function preflightImplementationRun(): Promise<ImplementationPreflight> {
  "use step";

  // Required for the planning call.
  void env.aiGateway;

  // Required for sandbox execution.
  const sandboxEnv = env.sandbox;

  // Required for PR creation and git push.
  const githubToken = env.github.token;
  if (!githubToken) {
    throw new AppError(
      "env_invalid",
      500,
      'Invalid environment for feature "github": missing GITHUB_TOKEN. See docs/ops/env.md.',
    );
  }

  return {
    aiGatewayBaseUrl: env.aiGateway.baseUrl,
    aiGatewayChatModel: env.aiGateway.chatModel,
    githubConfigured: true,
    ok: true,
    sandboxAuth: sandboxEnv.auth,
  };
}

/**
 * Resolve the connected repo for a project and compute the implementation branch name.
 *
 * @param input - Project scope and run identity.
 * @returns Repo context required for sandbox checkout and PR creation.
 */
export async function ensureImplementationRepoContext(
  input: Readonly<{ projectId: string; runId: string }>,
): Promise<ImplementationRepoContext> {
  "use step";

  const db = getDb();

  const project = await db.query.projectsTable.findFirst({
    columns: { name: true, slug: true },
    where: eq(schema.projectsTable.id, input.projectId),
  });

  if (!project) {
    throw new AppError("not_found", 404, "Project not found.");
  }

  const repo = await db.query.reposTable.findFirst({
    orderBy: (t) => [asc(t.createdAt)],
    where: eq(schema.reposTable.projectId, input.projectId),
  });

  if (!repo) {
    throw new AppError(
      "conflict",
      409,
      "No repository is connected to this project. Connect a GitHub repository to enable implementation runs.",
    );
  }

  const branchName = `agent/${project.slug}/${input.runId}`;

  const detected = await detectGitHubRepoRuntimeKindStrict({
    owner: repo.owner,
    ref: repo.defaultBranch,
    repo: repo.name,
  });

  return {
    branchName,
    cloneUrl: repo.cloneUrl,
    defaultBranch: repo.defaultBranch,
    htmlUrl: repo.htmlUrl,
    name: repo.name,
    owner: repo.owner,
    projectId: input.projectId,
    projectName: project.name,
    projectSlug: project.slug,
    provider: repo.provider,
    repoId: repo.id,
    repoKind: detected.kind,
  };
}

/**
 * Create a sandbox checkout and install dependencies.
 *
 * @param input - Repo connection + branch info.
 * @returns Sandbox identity and repo path.
 */
export async function sandboxCheckoutImplementationRepo(
  input: Readonly<{
    projectId: string;
    runId: string;
    cloneUrl: string;
    defaultBranch: string;
    branchName: string;
    repoKind: RepoRuntimeKind;
  }>,
): Promise<ImplementationSandboxCheckout> {
  "use step";

  const token = assertGitHubToken(env.github.token ?? "");

  const networkPolicy =
    input.repoKind === "python"
      ? SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT
      : SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT;
  const runtime = input.repoKind === "python" ? "python3.13" : "node24";

  const session = await startSandboxJobSession({
    jobType: "implementation_checkout",
    metadata: {
      baseBranch: input.defaultBranch,
      branchName: input.branchName,
      repoKind: input.repoKind,
    },
    networkPolicy,
    projectId: input.projectId,
    runId: input.runId,
    runtime,
    source: {
      depth: 1,
      password: token,
      revision: input.defaultBranch,
      type: "git",
      url: input.cloneUrl,
      username: "x-access-token",
    },
    stopOnFinalize: false,
    timeoutMs: 30 * 60 * 1000,
    vcpus: 2,
  });

  let exitCode = 1;
  try {
    const checkout = await session.runCommand({
      args: ["checkout", "-b", input.branchName],
      cmd: "git",
      cwd: SANDBOX_REPO_ROOT,
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = checkout.exitCode;
    if (checkout.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to create run branch (exit ${checkout.exitCode}).`,
      );
    }

    if (input.repoKind === "python") {
      const uvLock = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/uv.lock`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const sync = await session.runCommand({
        args: uvLock.exitCode === 0 ? ["sync", "--frozen"] : ["sync"],
        cmd: "uv",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      exitCode = sync.exitCode;
      if (sync.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `uv sync failed (exit ${sync.exitCode}).`,
        );
      }
    } else {
      const bunLockb = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/bun.lockb`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const bunLock = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/bun.lock`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const pnpmLock = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/pnpm-lock.yaml`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const npmLock = await session.runCommand({
        args: ["-f", `${SANDBOX_REPO_ROOT}/package-lock.json`],
        cmd: "test",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });
      const bunWhich = await session.runCommand({
        args: ["bun"],
        cmd: "which",
        cwd: SANDBOX_REPO_ROOT,
        policy: "implementation_run",
      });

      const hasBunLock = bunLockb.exitCode === 0 || bunLock.exitCode === 0;
      const hasBun = bunWhich.exitCode === 0;
      const hasPnpmLock = pnpmLock.exitCode === 0;
      const hasNpmLock = npmLock.exitCode === 0;

      const install =
        hasBun && hasBunLock
          ? await session.runCommand({
              args: ["install", "--frozen-lockfile"],
              cmd: "bun",
              cwd: SANDBOX_REPO_ROOT,
              policy: "implementation_run",
            })
          : hasPnpmLock
            ? await session.runCommand({
                args: ["install", "--frozen-lockfile"],
                cmd: "pnpm",
                cwd: SANDBOX_REPO_ROOT,
                policy: "implementation_run",
              })
            : hasNpmLock
              ? await session.runCommand({
                  args: ["ci"],
                  cmd: "npm",
                  cwd: SANDBOX_REPO_ROOT,
                  policy: "implementation_run",
                })
              : await session.runCommand({
                  args: ["install"],
                  cmd: "npm",
                  cwd: SANDBOX_REPO_ROOT,
                  policy: "implementation_run",
                });

      exitCode = install.exitCode;
      if (install.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `Dependency install failed (exit ${install.exitCode}).`,
        );
      }
    }

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      baseBranch: input.defaultBranch,
      branchName: input.branchName,
      repoPath: SANDBOX_REPO_ROOT,
      sandboxId: session.sandbox.sandboxId,
      sandboxJobId: finalized.job.id,
      transcriptBlobRef: finalized.job.transcriptBlobRef,
      transcriptTruncated: finalized.transcript.truncated,
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

const implementationPlanSchema = z.strictObject({
  commitMessage: z.string().min(1),
  planMarkdown: z.string().min(1),
  prBody: z.string().min(1),
  prTitle: z.string().min(1),
});

/**
 * Generate a minimal implementation plan via AI Gateway.
 *
 * @param input - Context used to ground the planning prompt.
 * @returns Plan metadata used for PR and patch application.
 * @throws AppError - When planning context is missing/invalid or the Context7 budget is exceeded.
 */
export async function planImplementationRun(
  input: Readonly<{
    projectId: string;
    projectName: string;
    projectSlug: string;
    runId: string;
    repoOwner: string;
    repoName: string;
  }>,
): Promise<ImplementationPlan> {
  "use step";

  const provider = createGateway({
    apiKey: env.aiGateway.apiKey,
    baseURL: env.aiGateway.baseUrl,
  });

  const model = provider.languageModel(
    env.aiGateway.chatModel as GatewayModelId,
  );

  const availableSkills = await listAvailableSkillsForProject(input.projectId);

  const context7Configured = (() => {
    try {
      return Boolean(env.context7);
    } catch {
      return false;
    }
  })();

  const skillMetadataSchema = z.object({
    description: z.string(),
    location: z.string(),
    name: z.string(),
    source: z.enum(["db", "fs"]),
  });

  const callOptionsSchema = z.object({
    projectId: z.string().min(1),
    skills: z.array(skillMetadataSchema),
  });

  const plannerContextSchema = z.object({
    context7Calls: z.number().int().min(0).default(0),
    projectId: z.string().min(1),
    skills: z.array(skillMetadataSchema).default([]),
  });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  type PlannerContext = {
    projectId: string;
    skills: SkillMetadata[];
    context7Calls: number;
  };

  function parsePlannerContext(value: unknown): PlannerContext {
    const parsed = plannerContextSchema.safeParse(value);
    if (parsed.success) {
      // Preserve reference so tools can mutate budget counters.
      if (isRecord(value)) {
        value.projectId = parsed.data.projectId;
        value.skills = parsed.data.skills;
        value.context7Calls = parsed.data.context7Calls;
        return value as unknown as PlannerContext;
      }
      return parsed.data as unknown as PlannerContext;
    }

    throw new AppError(
      "bad_request",
      400,
      "Missing planning context for tool execution.",
      parsed.error,
    );
  }

  const skillsLoadTool = tool({
    description: "Load a skill to get specialized instructions.",
    async execute(
      { name }: Readonly<{ name: string }>,
      options: ToolExecutionOptions,
    ) {
      const ctx = parsePlannerContext(options.experimental_context);
      return await loadSkillForProject({ name, projectId: ctx.projectId });
    },
    inputSchema: z.strictObject({
      name: z.string().min(1),
    }),
  });

  const skillsReadFileTool = tool({
    description:
      "Read a file referenced by a skill (repo-bundled directory or bundled ZIP). Path must be relative to the skill directory.",
    async execute(
      { name, path }: Readonly<{ name: string; path: string }>,
      options: ToolExecutionOptions,
    ) {
      const ctx = parsePlannerContext(options.experimental_context);
      return await readSkillFileForProject({
        name,
        path,
        projectId: ctx.projectId,
      });
    },
    inputSchema: z.strictObject({
      name: z.string().min(1),
      path: z.string().min(1),
    }),
  });

  let tools: ToolSet = {
    "skills.load": skillsLoadTool,
    "skills.readFile": skillsReadFileTool,
  };

  if (context7Configured) {
    const context7ResolveTool = tool({
      description:
        "Resolve a library/package name to a Context7 libraryId for documentation lookup.",
      async execute(
        {
          libraryName,
          query,
        }: Readonly<{ libraryName: string; query: string }>,
        options: ToolExecutionOptions,
      ) {
        const ctx = parsePlannerContext(options.experimental_context);
        if (ctx.context7Calls >= budgets.maxContext7CallsPerTurn) {
          throw new AppError(
            "conflict",
            409,
            "Context7 budget exceeded for this turn.",
          );
        }
        ctx.context7Calls += 1;
        return await context7ResolveLibraryId(
          { libraryName, query },
          { abortSignal: options.abortSignal },
        );
      },
      inputSchema: z.strictObject({
        libraryName: z.string().min(1),
        query: z.string().min(1),
      }),
    });

    const context7QueryTool = tool({
      description: "Query Context7 docs for a libraryId.",
      async execute(
        { libraryId, query }: Readonly<{ libraryId: string; query: string }>,
        options: ToolExecutionOptions,
      ) {
        const ctx = parsePlannerContext(options.experimental_context);
        if (ctx.context7Calls >= budgets.maxContext7CallsPerTurn) {
          throw new AppError(
            "conflict",
            409,
            "Context7 budget exceeded for this turn.",
          );
        }
        ctx.context7Calls += 1;
        return await context7QueryDocs(
          { libraryId, query },
          { abortSignal: options.abortSignal },
        );
      },
      inputSchema: z.strictObject({
        libraryId: z.string().min(1),
        query: z.string().min(1),
      }),
    });

    tools = {
      ...tools,
      "context7.query-docs": context7QueryTool,
      "context7.resolve-library-id": context7ResolveTool,
    };
  }

  const agent = new ToolLoopAgent({
    callOptionsSchema,
    instructions: [
      "You are generating a minimal implementation-run plan for a GitOps workflow.",
      "",
      "Constraints:",
      "- Output must match the schema exactly.",
      "- Keep the plan markdown short (under ~200 lines).",
      "- The plan is informational only; code changes are applied in a later step.",
      "",
      "Use skills when relevant via skills.load.",
    ].join("\n"),
    maxOutputTokens: 2048,
    model,
    output: Output.object({ schema: implementationPlanSchema }),
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      experimental_context: {
        context7Calls: 0,
        projectId: options.projectId,
        skills: options.skills,
      },
      instructions: [
        settings.instructions,
        buildSkillsPrompt(options.skills),
      ].join("\n\n"),
    }),
    stopWhen: stepCountIs(10),
    temperature: 0.2,
    tools,
  });

  const result = await agent.generate({
    options: {
      projectId: input.projectId,
      skills: availableSkills,
    },
    prompt: [
      `Project: ${input.projectName} (${input.projectSlug})`,
      `Repo: ${input.repoOwner}/${input.repoName}`,
      `Run ID: ${input.runId}`,
      "",
      "Provide:",
      "- a PR title/body for a PR that records this plan in the repo",
      "- a single commit message",
      "- a markdown plan",
    ].join("\n"),
  });

  return result.output;
}

function toNewFilePatch(
  input: Readonly<{ filePath: string; content: string }>,
): string {
  const normalized = input.filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid patch file path.");
  }

  const lines = input.content.replaceAll("\r\n", "\n").split("\n");
  // Ensure file ends with a trailing newline for stable patch application.
  if (lines.at(-1) !== "") {
    lines.push("");
  }

  const hunkLines = lines.map((line) => `+${line}`).join("\n");
  const total = lines.length;

  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 +1,${total} @@`,
    hunkLines,
    "",
  ].join("\n");
}

/**
 * Apply a deterministic patch in the sandbox checkout and push a branch.
 *
 * @param input - Sandbox + repo context.
 * @returns Commit identity.
 */
export async function applyImplementationPatch(
  input: Readonly<{
    projectId: string;
    sandboxId: string;
    repoPath: string;
    branchName: string;
    runId: string;
    commitMessage: string;
    planMarkdown: string;
  }>,
): Promise<ImplementationPatchResult> {
  "use step";

  const token = assertGitHubToken(env.github.token ?? "");

  const addedFilePath = `implementation-run-${input.runId}.md`;
  const patch = toNewFilePatch({
    content: input.planMarkdown,
    filePath: addedFilePath,
  });
  const session = await attachSandboxJobSession({
    jobType: "implementation_patch",
    metadata: {
      branchName: input.branchName,
    },
    projectId: input.projectId,
    runId: input.runId,
    sandboxId: input.sandboxId,
    stopOnFinalize: false,
  });

  const patchPath = `${SANDBOX_REPO_ROOT}/patch.diff`;
  const askPassPath = `${SANDBOX_REPO_ROOT}/.git-askpass.sh`;
  const askPassScript = [
    "#!/bin/sh",
    'case "$1" in',
    '*Username*) echo "x-access-token" ;;',
    '*Password*) echo "$GITHUB_TOKEN" ;;',
    '*) echo "" ;;',
    "esac",
    "",
  ].join("\n");

  let exitCode = 1;
  try {
    await session.sandbox.writeFiles([
      { content: Buffer.from(patch, "utf8"), path: patchPath },
      { content: Buffer.from(askPassScript, "utf8"), path: askPassPath },
    ]);

    const chmod = await session.runCommand({
      args: ["700", askPassPath],
      cmd: "chmod",
      cwd: SANDBOX_REPO_ROOT,
      policy: "implementation_run",
    });
    exitCode = chmod.exitCode;
    if (chmod.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to chmod askpass script (exit ${chmod.exitCode}).`,
      );
    }

    const apply = await session.runCommand({
      args: ["-C", input.repoPath, "apply", "--index", patchPath],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = apply.exitCode;
    if (apply.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to apply patch (exit ${apply.exitCode}).`,
      );
    }

    // Ensure commits have stable identity.
    const configName = await session.runCommand({
      args: ["-C", input.repoPath, "config", "user.name", "AI Agent Builder"],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = configName.exitCode;
    if (configName.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to set git user.name (exit ${configName.exitCode}).`,
      );
    }

    const configEmail = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "config",
        "user.email",
        "ai-agent-builder@users.noreply.github.com",
      ],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = configEmail.exitCode;
    if (configEmail.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to set git user.email (exit ${configEmail.exitCode}).`,
      );
    }

    const commit = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "commit",
        "--no-gpg-sign",
        "-m",
        input.commitMessage,
      ],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = commit.exitCode;
    if (commit.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `git commit failed (exit ${commit.exitCode}).`,
      );
    }

    const rev = await session.runCommand({
      args: ["-C", input.repoPath, "rev-parse", "HEAD"],
      cmd: "git",
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = rev.exitCode;
    if (rev.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `Failed to resolve commit SHA (exit ${rev.exitCode}).`,
      );
    }

    const commitSha = extractGitShaFromTranscript(rev.transcript);
    if (!commitSha) {
      throw new AppError("bad_gateway", 502, "Missing commit SHA output.");
    }

    const push = await session.runCommand({
      args: [
        "-C",
        input.repoPath,
        "push",
        "--set-upstream",
        "origin",
        input.branchName,
      ],
      cmd: "git",
      env: {
        GIT_ASKPASS: askPassPath,
        GIT_TERMINAL_PROMPT: "0",
        GITHUB_TOKEN: token,
      },
      extraSecrets: [token],
      policy: "implementation_run",
    });
    exitCode = push.exitCode;
    if (push.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `git push failed (exit ${push.exitCode}).`,
      );
    }

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      addedFilePath,
      branchName: input.branchName,
      commitSha,
      sandboxJobId: finalized.job.id,
      transcriptBlobRef: finalized.job.transcriptBlobRef,
      transcriptTruncated: finalized.transcript.truncated,
    };
  } catch (err) {
    try {
      await session.finalize({ exitCode, status: "failed" });
    } catch {
      // Best effort only.
    }
    try {
      // If patching fails, stop the sandbox to avoid leaking resources.
      await session.sandbox.stop();
    } catch {
      // Best effort only.
    }
    throw err;
  }
}

/**
 * Run the full verification suite in the sandbox checkout.
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
    if (input.repoKind === "python") {
      const ruffVersion = await session.runCommand({
        args: ["run", "ruff", "--version"],
        cmd: "uv",
        cwd: input.repoPath,
        policy: "implementation_run",
      });
      exitCode = ruffVersion.exitCode;
      if (ruffVersion.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          "Python repo is missing ruff. Add it to the project and run via `uv run ruff`.",
        );
      }

      const lint = await session.runCommand({
        args: ["run", "ruff", "check", "."],
        cmd: "uv",
        cwd: input.repoPath,
        policy: "implementation_run",
      });
      exitCode = lint.exitCode;
      if (lint.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `ruff failed (exit ${lint.exitCode}).`,
        );
      }

      let typecheckTool: "pyright" | "mypy" = "pyright";
      let typecheckExitCode = 1;

      const pyrightVersion = await session.runCommand({
        args: ["run", "pyright", "--version"],
        cmd: "uv",
        cwd: input.repoPath,
        policy: "implementation_run",
      });
      if (pyrightVersion.exitCode === 0) {
        const pyright = await session.runCommand({
          args: ["run", "pyright"],
          cmd: "uv",
          cwd: input.repoPath,
          policy: "implementation_run",
        });
        typecheckExitCode = pyright.exitCode;
        exitCode = pyright.exitCode;
        if (pyright.exitCode !== 0) {
          throw new AppError(
            "bad_gateway",
            502,
            `pyright failed (exit ${pyright.exitCode}).`,
          );
        }
      } else {
        typecheckTool = "mypy";
        const mypyVersion = await session.runCommand({
          args: ["run", "mypy", "--version"],
          cmd: "uv",
          cwd: input.repoPath,
          policy: "implementation_run",
        });
        exitCode = mypyVersion.exitCode;
        if (mypyVersion.exitCode !== 0) {
          throw new AppError(
            "bad_gateway",
            502,
            "Python repo is missing a type checker (pyright or mypy). Add one and run via `uv run`.",
          );
        }

        const mypy = await session.runCommand({
          args: ["run", "mypy", "."],
          cmd: "uv",
          cwd: input.repoPath,
          policy: "implementation_run",
        });
        typecheckExitCode = mypy.exitCode;
        exitCode = mypy.exitCode;
        if (mypy.exitCode !== 0) {
          throw new AppError(
            "bad_gateway",
            502,
            `mypy failed (exit ${mypy.exitCode}).`,
          );
        }
      }

      const pytestVersion = await session.runCommand({
        args: ["run", "pytest", "--version"],
        cmd: "uv",
        cwd: input.repoPath,
        policy: "implementation_run",
      });
      exitCode = pytestVersion.exitCode;
      if (pytestVersion.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          "Python repo is missing pytest. Add it to the project and run via `uv run pytest`.",
        );
      }

      const test = await session.runCommand({
        args: ["run", "pytest"],
        cmd: "uv",
        cwd: input.repoPath,
        policy: "implementation_run",
      });
      exitCode = test.exitCode;
      if (test.exitCode !== 0) {
        throw new AppError(
          "bad_gateway",
          502,
          `pytest failed (exit ${test.exitCode}).`,
        );
      }

      const finalized = await session.finalize({
        exitCode: 0,
        status: "succeeded",
      });

      return {
        kind: "python",
        lint: { exitCode: lint.exitCode },
        ok: true,
        sandboxJobId: finalized.job.id,
        test: { exitCode: test.exitCode },
        transcriptBlobRef: finalized.job.transcriptBlobRef,
        transcriptTruncated: finalized.transcript.truncated,
        typecheck: { exitCode: typecheckExitCode },
        typecheckTool,
      };
    }

    const bunWhich = await session.runCommand({
      args: ["bun"],
      cmd: "which",
      cwd: input.repoPath,
      policy: "implementation_run",
    });
    const runner =
      bunWhich.exitCode === 0
        ? ("bun" as const)
        : (
              await session.runCommand({
                args: ["-f", `${input.repoPath}/pnpm-lock.yaml`],
                cmd: "test",
                cwd: input.repoPath,
                policy: "implementation_run",
              })
            ).exitCode === 0
          ? ("pnpm" as const)
          : ("npm" as const);

    const runScript = async (script: string) =>
      await session.runCommand({
        args: ["run", script],
        cmd: runner,
        cwd: input.repoPath,
        policy: "implementation_run",
      });

    const lint = await runScript("lint");
    exitCode = lint.exitCode;
    if (lint.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `lint failed (exit ${lint.exitCode}).`,
      );
    }

    const typecheck = await runScript("typecheck");
    exitCode = typecheck.exitCode;
    if (typecheck.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `typecheck failed (exit ${typecheck.exitCode}).`,
      );
    }

    const test = await runScript("test");
    exitCode = test.exitCode;
    if (test.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `test failed (exit ${test.exitCode}).`,
      );
    }

    const build = await runScript("build");
    exitCode = build.exitCode;
    if (build.exitCode !== 0) {
      throw new AppError(
        "bad_gateway",
        502,
        `build failed (exit ${build.exitCode}).`,
      );
    }

    const finalized = await session.finalize({
      exitCode: 0,
      status: "succeeded",
    });

    return {
      build: { exitCode: build.exitCode },
      kind: "node",
      lint: { exitCode: lint.exitCode },
      ok: true,
      sandboxJobId: finalized.job.id,
      test: { exitCode: test.exitCode },
      transcriptBlobRef: finalized.job.transcriptBlobRef,
      transcriptTruncated: finalized.transcript.truncated,
      typecheck: { exitCode: typecheck.exitCode },
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

/**
 * Open (or fetch) a pull request for the run branch.
 *
 * @param input - Repo + branch identity and PR content.
 * @returns Pull request metadata.
 */
export async function openImplementationPullRequest(
  input: Readonly<{
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }>,
): Promise<ImplementationPullRequestResult> {
  "use step";

  const pr = await createOrGetPullRequest({
    base: input.base,
    body: input.body,
    head: input.head,
    owner: input.owner,
    repo: input.repo,
    title: input.title,
  });

  return {
    base: pr.baseRef,
    head: pr.headRef,
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.htmlUrl,
  };
}

/**
 * Stop a sandbox after implementation steps complete.
 *
 * @param sandboxId - Sandbox ID.
 */
export async function stopImplementationSandbox(
  sandboxId: string,
): Promise<void> {
  "use step";

  const sandbox = await getVercelSandbox(sandboxId).catch(() => null);
  if (!sandbox) return;
  try {
    await sandbox.stop();
  } catch {
    // Best effort: sandbox may have already timed out or been stopped elsewhere.
  }
}
