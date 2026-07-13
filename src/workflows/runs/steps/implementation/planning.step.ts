import "server-only";

import { isStepCount, Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";

import { getChatModelById } from "@/lib/ai/gateway.server";
import {
  listAvailableSkillsForProject,
  loadSkillForProject,
  readSkillFileForProject,
} from "@/lib/ai/skills/index.server";
import { buildSkillsPrompt } from "@/lib/ai/skills/prompt";
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
  skills: z.array(skillMetadataSchema),
});

const plannerToolContextSchema = z
  .strictObject({
    projectId: z.string().min(1),
  })
  .readonly();

/**
 * Generate a minimal implementation plan via AI Gateway.
 *
 * @param input - Context used to ground the planning prompt.
 * @returns Plan metadata used for PR and patch application.
 * @throws AppError - When the Context7 call budget is exceeded.
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

  const model = getChatModelById(env.aiGateway.chatModel);

  const availableSkills = await listAvailableSkillsForProject(input.projectId);

  const context7Configured = (() => {
    try {
      return Boolean(env.context7);
    } catch {
      return false;
    }
  })();

  const skillsLoadTool = tool({
    contextSchema: plannerToolContextSchema,
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
    contextSchema: plannerToolContextSchema,
    description:
      "Read a file referenced by a skill (repo-bundled directory or bundled ZIP). Path must be relative to the skill directory.",
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

  let context7Calls = 0;
  function consumeContext7Call(): void {
    if (context7Calls >= budgets.maxContext7CallsPerTurn) {
      throw new AppError(
        "conflict",
        409,
        "Context7 budget exceeded for this turn.",
      );
    }
    context7Calls += 1;
  }

  const context7Tools = context7Configured
    ? await (async () => {
        // Load only when configured so disabled environments avoid the MCP module.
        const { context7QueryDocs, context7ResolveLibraryId } = await import(
          "@/lib/ai/tools/mcp-context7.server"
        );

        return {
          "context7.query-docs": tool({
            description: "Query Context7 docs for a libraryId.",
            async execute({ libraryId, query }, { abortSignal }) {
              consumeContext7Call();
              return await context7QueryDocs(
                { libraryId, query },
                { abortSignal },
              );
            },
            inputSchema: z.strictObject({
              libraryId: z.string().min(1),
              query: z.string().min(1),
            }),
          }),
          "context7.resolve-library-id": tool({
            description:
              "Resolve a library/package name to a Context7 libraryId for documentation lookup.",
            async execute({ libraryName, query }, { abortSignal }) {
              consumeContext7Call();
              return await context7ResolveLibraryId(
                { libraryName, query },
                { abortSignal },
              );
            },
            inputSchema: z.strictObject({
              libraryName: z.string().min(1),
              query: z.string().min(1),
            }),
          }),
        };
      })()
    : {};

  const tools = {
    ...context7Tools,
    "skills.load": skillsLoadTool,
    "skills.readFile": skillsReadFileTool,
  };

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
      instructions: [
        settings.instructions,
        buildSkillsPrompt(options.skills),
      ].join("\n\n"),
    }),
    stopWhen: isStepCount(10),
    temperature: 0.2,
    tools,
    toolsContext: {
      "skills.load": { projectId: input.projectId },
      "skills.readFile": { projectId: input.projectId },
    },
  });

  const result = await agent.generate({
    options: {
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
