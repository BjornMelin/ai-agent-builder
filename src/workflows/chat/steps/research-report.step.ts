import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { getAgentMode } from "@/lib/ai/agents/registry";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import {
  createResearchReportArtifact,
  type ResearchReportResult,
} from "@/lib/research/research-report.server";
import { parseChatToolContext } from "@/workflows/chat/tool-context";

const inputSchema = z.object({
  query: z.string().min(1),
});

/**
 * Create a citation-backed research report artifact.
 *
 * @param input - Tool input.
 * @param options - Tool execution options (includes experimental_context.projectId).
 * @returns Artifact metadata for the created report.
 * @throws AppError - When input/context is invalid or tool budgets are exceeded.
 */
export async function createResearchReportStep(
  input: Readonly<{ query: string }>,
  options: ToolExecutionOptions,
): Promise<ResearchReportResult> {
  "use step";

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid research report input.",
      parsed.error,
    );
  }

  let ctx: ReturnType<typeof parseChatToolContext>;
  try {
    ctx = parseChatToolContext(options.experimental_context);
  } catch (error) {
    throw new AppError(
      "bad_request",
      400,
      "Missing project context for research report.",
      error,
    );
  }

  if (ctx.toolBudget.webSearchCalls >= budgets.maxWebSearchCallsPerTurn) {
    throw new AppError(
      "conflict",
      409,
      "Web search budget exceeded for this turn.",
    );
  }
  ctx.toolBudget.webSearchCalls += 1;

  const remainingExtracts =
    budgets.maxWebExtractCallsPerTurn - ctx.toolBudget.webExtractCalls;
  if (remainingExtracts <= 0) {
    throw new AppError(
      "conflict",
      409,
      "Web extract budget exceeded for this turn.",
    );
  }
  const maxExtractUrls = Math.min(3, remainingExtracts);
  ctx.toolBudget.webExtractCalls += maxExtractUrls;

  const mode = getAgentMode(ctx.modeId);

  return createResearchReportArtifact({
    abortSignal: options.abortSignal,
    maxExtractUrls,
    modelId: mode.defaultModel,
    projectId: ctx.projectId,
    query: parsed.data.query,
  });
}
