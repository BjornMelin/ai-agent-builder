import type { ToolExecutionOptions } from "ai";
import { getStepMetadata } from "workflow";
import { z } from "zod";
import { getAgentMode } from "@/lib/ai/agents/registry";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import {
  createResearchReportArtifact,
  type ResearchReportResult,
} from "@/lib/research/research-report.server";
import {
  type ResearchToolContext,
  researchToolContextSchema,
} from "@/workflows/chat/tool-context";

const inputSchema = z.object({
  query: z.string().min(1),
});

/**
 * Create a citation-backed research report artifact.
 *
 * @param input - Tool input.
 * @param options - Tool execution options containing immutable project scope.
 * @returns Artifact metadata for the created report.
 * @throws AppError - When input or context is invalid.
 */
export async function createResearchReportStep(
  input: Readonly<{ query: string }>,
  options: ToolExecutionOptions<ResearchToolContext>,
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

  const context = researchToolContextSchema.safeParse(options.context);
  if (!context.success) {
    throw new AppError(
      "bad_request",
      400,
      "Missing project context for research report.",
      context.error,
    );
  }

  const maxExtractUrls = Math.min(3, budgets.maxWebExtractCallsPerTurn);
  const mode = getAgentMode(context.data.modeId);
  const { stepId } = getStepMetadata();

  return createResearchReportArtifact({
    abortSignal: options.abortSignal,
    idempotencyKey: stepId,
    maxExtractUrls,
    modelId: mode.defaultModel,
    projectId: context.data.projectId,
    query: parsed.data.query,
  });
}
