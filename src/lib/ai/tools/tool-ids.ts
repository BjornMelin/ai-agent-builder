import "server-only";

/**
 * Canonical tool identifiers used for allowlisting per agent mode.
 *
 * @remarks
 * These IDs are shared between:
 * - agent mode registry (allowedTools)
 * - tool factory (default-deny filtering)
 * - tests (contract enforcement)
 */
export const toolIds = [
  "skills.load",
  "skills.readFile",
  "retrieveProjectChunks",
  "web.search",
  "web.extract",
  "research.create-report",
  "context7.resolve-library-id",
  "context7.query-docs",
] as const;

/**
 * Union of all known tool identifiers.
 */
export type ToolId = (typeof toolIds)[number];
