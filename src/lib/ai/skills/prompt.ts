import type { SkillMetadata } from "@/lib/ai/skills/types";

const MAX_SKILLS_IN_PROMPT = 50;
const MAX_DESCRIPTION_CHARS = 200;

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}

/**
 * Build a progressive-disclosure skills prompt fragment.
 *
 * @param skills - Skill metadata list.
 * @returns Prompt text suitable for appending to a system prompt/instructions.
 */
export function buildSkillsPrompt(skills: readonly SkillMetadata[]): string {
  if (skills.length === 0) {
    return [
      "## Skills",
      "",
      "No agent skills are configured for this project.",
      "",
    ].join("\n");
  }

  const listed = skills.slice(0, MAX_SKILLS_IN_PROMPT);
  const lines = listed.map((skill) => {
    const desc = limitText(skill.description, MAX_DESCRIPTION_CHARS);
    return `- ${skill.name}: ${desc}`;
  });

  const more =
    skills.length > listed.length
      ? [``, `(${skills.length - listed.length} more omitted)`, ``]
      : [""];

  return [
    "## Skills",
    "",
    "Use the `skills.load` tool when the user request matches a skill description.",
    "Use `skills.readFile` to read referenced files under a skill directory (repo-bundled skills and project-installed bundled skills).",
    "",
    "Available skills:",
    ...lines,
    ...more,
  ].join("\n");
}
