import { z } from "zod";

import { DEFAULT_AGENT_MODE_ID } from "@/lib/ai/agents/registry";
import type { SkillMetadata } from "@/lib/ai/skills/types";

/**
 * Mutable tool budget counters passed via `experimental_context`.
 *
 * @remarks
 * These counters are per-agent-turn. The workflow creates a fresh context for
 * each `agent.stream()` call.
 */
export type ChatToolBudget = {
  context7Calls: number;
  webExtractCalls: number;
  webSearchCalls: number;
};

/**
 * Context object passed to tools via `experimental_context`.
 *
 * @remarks
 * Contains project scope, mode selection, and mutable budget counters for per-turn enforcement.
 */
export type ChatToolContext = {
  projectId: string;
  modeId: string;
  toolBudget: ChatToolBudget;
  skills: readonly SkillMetadata[];
};

const toolBudgetSchema = z.object({
  context7Calls: z.number().int().min(0).default(0),
  webExtractCalls: z.number().int().min(0).default(0),
  webSearchCalls: z.number().int().min(0).default(0),
});

const skillMetadataSchema = z.object({
  description: z.string(),
  location: z.string(),
  name: z.string(),
  source: z.enum(["db", "fs"]),
});

const toolContextSchema = z.object({
  modeId: z.string().min(1).default(DEFAULT_AGENT_MODE_ID),
  projectId: z.string().min(1),
  skills: z.array(skillMetadataSchema).default([]),
  toolBudget: toolBudgetSchema.default({
    context7Calls: 0,
    webExtractCalls: 0,
    webSearchCalls: 0,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Create a fresh tool context for an agent turn.
 *
 * @param projectId - Project identifier.
 * @param modeId - Agent mode identifier.
 * @param skills - Skills metadata available for progressive disclosure.
 * @returns Tool context object.
 */
export function createChatToolContext(
  projectId: string,
  modeId: string,
  skills: readonly SkillMetadata[] = [],
): ChatToolContext {
  return {
    modeId,
    projectId,
    skills,
    toolBudget: { context7Calls: 0, webExtractCalls: 0, webSearchCalls: 0 },
  };
}

/**
 * Parse `experimental_context` into a typed tool context.
 *
 * @param value - Untrusted context value.
 * @returns Parsed tool context.
 * @throws Error - When the context is missing or malformed.
 */
export function parseChatToolContext(value: unknown): ChatToolContext {
  const parsed = toolContextSchema.safeParse(value);
  if (parsed.success) {
    // Zod returns a new object; we need to preserve the original reference so
    // tools can mutate per-turn budgets via `experimental_context`.
    if (isRecord(value)) {
      value.modeId = parsed.data.modeId;
      value.projectId = parsed.data.projectId;

      const budgetValue = value.toolBudget;
      if (isRecord(budgetValue)) {
        budgetValue.context7Calls = parsed.data.toolBudget.context7Calls;
        budgetValue.webExtractCalls = parsed.data.toolBudget.webExtractCalls;
        budgetValue.webSearchCalls = parsed.data.toolBudget.webSearchCalls;
      } else {
        value.toolBudget = { ...parsed.data.toolBudget };
      }

      value.skills = parsed.data.skills;

      return value as ChatToolContext;
    }

    return parsed.data;
  }

  throw new Error("Missing project context for tool execution.");
}
