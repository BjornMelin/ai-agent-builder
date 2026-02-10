import "server-only";

import { AppError } from "@/lib/core/errors";

type ParsedFrontmatter = Readonly<{
  name: string;
  description: string;
}>;

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function stripSurroundingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function countIndent(line: string): number {
  let n = 0;
  while (n < line.length) {
    const ch = line[n];
    if (ch !== " " && ch !== "\t") break;
    n += 1;
  }
  return n;
}

function parseYamlBlockScalar(
  blockLines: readonly string[],
  style: "folded" | "literal",
): string {
  const nonEmptyIndents = blockLines
    .filter((line) => line.trim().length > 0)
    .map(countIndent);
  const minIndent =
    nonEmptyIndents.length > 0 ? Math.min(...nonEmptyIndents) : 0;

  const stripped = blockLines.map((line) => {
    if (line.trim().length === 0) return "";
    return line.slice(minIndent);
  });

  const raw = stripped.join("\n");
  if (style === "literal") {
    return raw.trimEnd();
  }

  // Folded style: single newlines become spaces; blank lines separate paragraphs.
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  return paragraphs.join("\n\n");
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  let name = "";
  let description = "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }

    if (line.startsWith("name:")) {
      const value = line.slice("name:".length).trim();
      name = stripSurroundingQuotes(value).trim();
      i += 1;
      continue;
    }

    if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trim();
      const indicator = value.trim();

      if (indicator.startsWith(">") || indicator.startsWith("|")) {
        const style = indicator.startsWith(">")
          ? ("folded" as const)
          : ("literal" as const);
        const blockLines: string[] = [];

        i += 1;
        while (i < lines.length) {
          const next = lines[i] ?? "";
          if (next.trim().length === 0) {
            blockLines.push("");
            i += 1;
            continue;
          }
          if (next.startsWith(" ") || next.startsWith("\t")) {
            blockLines.push(next);
            i += 1;
            continue;
          }

          // Reached next root-level key.
          break;
        }

        description = parseYamlBlockScalar(blockLines, style).trim();
        continue;
      }

      description = stripSurroundingQuotes(value).trim();
      i += 1;
      continue;
    }

    i += 1;
  }

  if (!name) {
    throw new AppError("bad_request", 400, "Skill frontmatter missing name.");
  }
  if (!description) {
    throw new AppError(
      "bad_request",
      400,
      "Skill frontmatter missing description.",
    );
  }

  return { description, name };
}

/**
 * Strip YAML frontmatter from a SKILL.md file and return only the markdown body.
 *
 * @param content - Raw file content.
 * @returns Markdown body with frontmatter removed.
 */
export function stripSkillFrontmatter(content: string): string {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return content.trim();
  return content.slice(match[0].length).trim();
}

/**
 * Parse required frontmatter fields from a SKILL.md file.
 *
 * @param content - Raw SKILL.md content.
 * @returns Parsed frontmatter fields.
 * @throws AppError - When frontmatter is missing or malformed.
 */
export function parseSkillFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match?.[1]) {
    throw new AppError("bad_request", 400, "Missing skill frontmatter.");
  }
  return parseFrontmatter(match[1]);
}
