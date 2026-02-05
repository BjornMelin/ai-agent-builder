import "server-only";

import { z } from "zod";

/**
 * Canonical content schema for Markdown artifacts stored in `artifacts.content`.
 */
export const artifactMarkdownContentSchema = z.strictObject({
  format: z.literal("markdown"),
  markdown: z.string().min(1),
  summary: z.string().min(1).optional(),
  title: z.string().min(1),
});

/**
 * Markdown artifact content type.
 */
export type ArtifactMarkdownContent = z.infer<
  typeof artifactMarkdownContentSchema
>;

/**
 * Best-effort extract a Markdown payload from an artifact's JSON content.
 *
 * @param content - Raw artifact JSON content.
 * @returns Markdown content when available, otherwise null.
 */
export function getMarkdownContent(
  content: Record<string, unknown>,
): ArtifactMarkdownContent | null {
  const parsed = artifactMarkdownContentSchema.safeParse(content);
  return parsed.success ? parsed.data : null;
}
