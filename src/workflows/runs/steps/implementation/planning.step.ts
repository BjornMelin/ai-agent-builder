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
import { z } from "zod";

import {
  listAvailableSkillsForProject,
  loadSkillForProject,
  readSkillFileForProject,
} from "@/lib/ai/skills/index.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
import type { SkillMetadata } from "@/lib/ai/skills/types";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
import type { ImplementationPlan } from "@/workflows/runs/steps/implementation/contract";

const implementationPlanSchema = z.strictObject({
  commitMessage: z.string().min(1),
  planMarkdown: z.string().min(1),
  prBody: z.string().min(1),
  prTitle: z.string().min(1),
});

const skillMetadataSchema = z.strictObject({
  description: z.string(),
  location: z.string(),
  name: z.string(),
  source: z.enum(["db", "fs"]),
});

const callOptionsSchema = z.strictObject({
  projectId: z.string().min(1),
  skills: z.array(skillMetadataSchema),
});

const plannerContextSchema = z.strictObject({
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

/**
 * Generate a minimal implementation plan via AI Gateway.
 *
 * @param input - Context used to ground the planning prompt.
 * @returns Plan metadata used for PR and patch application.
 * @throws AppError - When planning context is missing/invalid or the Context7 budget is exceeded.
 * @see docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md
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
    // Optional dependency: load only when Context7 is configured to reduce the
    // module graph in environments where Context7 is disabled.
    const { context7QueryDocs, context7ResolveLibraryId } = await import(
      "@/lib/ai/tools/mcp-context7.server"
    );

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
