import "server-only";

import type { ToolExecutionOptions } from "ai";
import { z } from "zod";

import {
  listAvailableSkillsForProject,
  loadSkillForProject,
  readSkillFileForProject,
} from "@/lib/ai/skills/index.server";
import type {
  SkillLoadResult,
  SkillMetadata,
  SkillReadFileResult,
} from "@/lib/ai/skills/types";
import { AppError } from "@/lib/core/errors";
import { parseChatToolContext } from "@/workflows/chat/tool-context";

const loadInputSchema = z.object({
  name: z.string().min(1),
});

/**
 * `skills.load` tool step.
 *
 * @remarks ADR-0028: Hybrid filesystem + DB model for Agent Skills.
 *
 * @param input - Tool input.
 * @param options - Tool execution options.
 * @returns Loaded skill content or a structured error.
 * @throws AppError - With code `"bad_request"` when input validation fails.
 * @throws AppError - With code `"bad_request"` when project context is missing.
 */
export async function skillsLoadStep(
  input: Readonly<{ name: string }>,
  options: ToolExecutionOptions,
): Promise<SkillLoadResult> {
  "use step";

  const parsed = loadInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid skills.load input.",
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
      "Missing project context for skills.load.",
      error,
    );
  }

  return await loadSkillForProject({
    name: parsed.data.name,
    projectId: ctx.projectId,
  });
}

const readFileInputSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

/**
 * `skills.readFile` tool step.
 *
 * @remarks ADR-0028: Hybrid filesystem + DB model for Agent Skills.
 *
 * @param input - Tool input.
 * @param options - Tool execution options.
 * @returns File content or a structured error.
 * @throws AppError - With code `"bad_request"` when input validation fails.
 * @throws AppError - With code `"bad_request"` when project context is missing.
 */
export async function skillsReadFileStep(
  input: Readonly<{ name: string; path: string }>,
  options: ToolExecutionOptions,
): Promise<SkillReadFileResult> {
  "use step";

  const parsed = readFileInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid skills.readFile input.",
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
      "Missing project context for skills.readFile.",
      error,
    );
  }

  return await readSkillFileForProject({
    name: parsed.data.name,
    path: parsed.data.path,
    projectId: ctx.projectId,
  });
}

/**
 * List skills available for a project.
 *
 * @remarks ADR-0028: Hybrid filesystem + DB model for Agent Skills.
 *
 * @param input - Project identity.
 * @returns Skill metadata list.
 */
export async function listProjectSkillsStep(
  input: Readonly<{ projectId: string }>,
): Promise<SkillMetadata[]> {
  "use step";
  return await listAvailableSkillsForProject(input.projectId);
}
