import "server-only";

/**
 * Skill source used for resolution precedence and diagnostics.
 */
export type SkillSource = "db" | "fs";

/**
 * Minimal skill metadata used for progressive disclosure.
 *
 * @remarks
 * Agents see only `name` and `description` in the system prompt. Full skill
 * instructions are loaded on-demand via tools.
 */
export type SkillMetadata = Readonly<{
  name: string;
  description: string;
  source: SkillSource;
  /**
   * Skill location for diagnostics:
   * - filesystem skills: absolute directory path
   * - database skills: a stable identifier (e.g. `db:<id>`)
   */
  location: string;
}>;

/**
 * Result returned by the `skills.load` tool.
 */
export type SkillLoadResult =
  | Readonly<{
      ok: true;
      name: string;
      source: SkillSource;
      /**
       * Skill directory identifier for filesystem skills (repo-relative when possible);
       * null for DB skills.
       */
      skillDirectory: string | null;
      /**
       * Skill instructions (markdown body, frontmatter stripped).
       */
      content: string;
    }>
  | Readonly<{
      ok: false;
      error: string;
    }>;

/**
 * Result returned by the `skills.readFile` tool.
 */
export type SkillReadFileResult =
  | Readonly<{
      ok: true;
      name: string;
      path: string;
      content: string;
    }>
  | Readonly<{
      ok: false;
      error: string;
    }>;
