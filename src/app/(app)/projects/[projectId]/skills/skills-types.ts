/**
 * Skill summary used by the Skills UI for installed project skills.
 *
 * @remarks
 * This summary is safe to serialize to the client. Full SKILL.md content is
 * fetched on demand when the user edits a skill.
 */
export type ProjectSkillSummary = Readonly<{
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  origin: "manual" | "registry";
  registryId: string | null;
  registrySource: string | null;
  bundlePresent: boolean;
}>;

/**
 * Effective skill metadata shown in the Skills index.
 *
 * @remarks
 * Effective skills are resolved from project overrides (DB) and repo-bundled
 * skills (filesystem).
 */
export type EffectiveSkillSummary = Readonly<{
  name: string;
  description: string;
  source: "db" | "fs";
  originLabel: string;
}>;
