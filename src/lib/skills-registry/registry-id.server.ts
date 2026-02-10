import "server-only";

import { AppError } from "@/lib/core/errors";

/**
 * Parsed skill identity in the skills.sh registry.
 *
 * @remarks
 * Registry IDs follow the shape `owner/repo/skillId`.
 */
export type SkillsRegistrySkillRef = Readonly<{
  id: string;
  owner: string;
  repo: string;
  source: string;
  skillId: string;
}>;

const REGISTRY_ID_PATTERN =
  /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * Parse a skills.sh registry skill identifier.
 *
 * @param id - Registry id (`owner/repo/skillId`).
 * @returns Parsed registry reference.
 * @throws AppError - With code `"bad_request"` when id is invalid.
 */
export function parseSkillsRegistrySkillId(id: string): SkillsRegistrySkillRef {
  const trimmed = id.trim();
  if (!REGISTRY_ID_PATTERN.test(trimmed)) {
    throw new AppError("bad_request", 400, "Invalid registry skill id.");
  }

  const [owner, repo, skillId] = trimmed.split("/");
  if (!owner || !repo || !skillId) {
    // Should be unreachable due to the regex guard above.
    throw new AppError("bad_request", 400, "Invalid registry skill id.");
  }

  return {
    id: trimmed,
    owner,
    repo,
    skillId,
    source: `${owner}/${repo}`,
  };
}
