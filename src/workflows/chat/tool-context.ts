import { z } from "zod";

/**
 * Zod schema for skills metadata passed through AI SDK 7 `toolsContext`.
 */
export const chatToolSkillMetadataSchema = z.object({
  description: z.string(),
  location: z.string(),
  name: z.string(),
  source: z.enum(["db", "fs"]),
});

/** Project scope supplied only to project-owned chat tools. */
export const projectToolContextSchema = z.strictObject({
  projectId: z.string().min(1),
});

/** Immutable project scope available to retrieval and skill tools. */
export type ProjectToolContext = z.infer<typeof projectToolContextSchema>;

/** Project and mode scope supplied only to research tools. */
export const researchToolContextSchema = projectToolContextSchema.extend({
  modeId: z.string().min(1),
});

/** Immutable project and agent-mode scope available to research tools. */
export type ResearchToolContext = z.infer<typeof researchToolContextSchema>;
