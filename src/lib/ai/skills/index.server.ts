import "server-only";

import path from "node:path";
import { cacheLife, cacheTag } from "next/cache";

import { tagProjectSkillsIndex } from "@/lib/cache/tags";
import { AppError } from "@/lib/core/errors";
import { getProjectSkillByName } from "@/lib/data/project-skills.server";
import { env } from "@/lib/env";
import { readBundledSkillFileFromBlob } from "./bundle-read.server";
import { listDatabaseSkills, loadDatabaseSkillByName } from "./db.server";
import {
  discoverFilesystemSkills,
  loadFilesystemSkillBody,
  readFilesystemSkillFile,
} from "./fs-discovery.server";
import { getProjectSkillBundleRef } from "./project-skill-metadata.server";
import type {
  SkillLoadResult,
  SkillMetadata,
  SkillReadFileResult,
} from "./types";

const REPO_SKILL_ROOTS = {
  ".agents/skills": path.resolve(process.cwd(), ".agents/skills"),
  ".codex/skills": path.resolve(process.cwd(), ".codex/skills"),
} as const;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSkillRootKey(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function toRepoRelativePathOrNull(absoluteDir: string): string | null {
  const rel = path.relative(process.cwd(), absoluteDir);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;

  // Keep output stable across platforms (agents should use POSIX-like paths).
  return rel.split(path.sep).join("/");
}

function resolveConfiguredRoots(): string[] {
  const requested = env.skills.dirs.map(normalizeSkillRootKey).filter(Boolean);
  const uniqueRequested = Array.from(new Set(requested));
  if (uniqueRequested.length === 0) return [];

  const allowed = new Set(Object.keys(REPO_SKILL_ROOTS));
  const unknown = uniqueRequested.filter((dir) => !allowed.has(dir));
  if (unknown.length > 0) {
    throw new AppError(
      "env_invalid",
      500,
      `Unsupported AGENT_SKILLS_DIRS root(s): ${unknown.join(
        ", ",
      )}. Supported values: ${Array.from(allowed).join(", ")}.`,
    );
  }

  const roots: string[] = [];
  for (const key of uniqueRequested) {
    // keys are validated against the allowlist above.
    roots.push(REPO_SKILL_ROOTS[key as keyof typeof REPO_SKILL_ROOTS]);
  }
  return roots;
}

/**
 * List all available skills for a project (DB overrides + repo-bundled filesystem skills).
 *
 * @param projectId - Project identifier.
 * @returns Skill metadata for progressive disclosure.
 */
export async function listAvailableSkillsForProject(
  projectId: string,
): Promise<SkillMetadata[]> {
  "use cache";

  cacheLife("minutes");
  cacheTag(tagProjectSkillsIndex(projectId));

  const [dbSkills, fsSkills] = await Promise.all([
    listDatabaseSkills(projectId),
    discoverFilesystemSkills(resolveConfiguredRoots()),
  ]);

  const seen = new Set<string>();
  const merged: SkillMetadata[] = [];

  for (const skill of dbSkills) {
    const key = normalizeKey(skill.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(skill);
  }

  for (const skill of fsSkills) {
    const key = normalizeKey(skill.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(skill);
  }

  return merged;
}

/**
 * Load a skill for a project by name (case-insensitive).
 *
 * @param input - Project scope and skill identifier.
 * @returns Skill load result.
 * @throws AppError - With code `"bad_request"` when the skill name is invalid.
 * @throws AppError - With code `"env_invalid"` when the Agent Skills environment is invalid (for example, unsupported `AGENT_SKILLS_DIRS` roots).
 */
export async function loadSkillForProject(
  input: Readonly<{ projectId: string; name: string }>,
): Promise<SkillLoadResult> {
  const normalized = normalizeKey(input.name);
  if (!normalized) {
    throw new AppError("bad_request", 400, "Invalid skill name.");
  }

  const dbSkill = await loadDatabaseSkillByName(input.projectId, normalized);
  if (dbSkill) {
    return {
      content: dbSkill.content,
      name: dbSkill.name,
      ok: true,
      skillDirectory: null,
      source: "db",
    };
  }

  const skills = await listAvailableSkillsForProject(input.projectId);
  const fsSkill = skills.find(
    (skill) => skill.source === "fs" && normalizeKey(skill.name) === normalized,
  );
  if (!fsSkill) {
    return { error: `Skill '${input.name}' not found.`, ok: false };
  }

  const body = await loadFilesystemSkillBody(fsSkill.location);
  return {
    content: body,
    name: fsSkill.name,
    ok: true,
    skillDirectory: toRepoRelativePathOrNull(fsSkill.location),
    source: "fs",
  };
}

/**
 * Read a skill file from either a filesystem skill directory or a bundled project skill (ZIP in Blob).
 *
 * @param input - Project scope, skill name, and relative file path.
 * @returns File read result.
 * @throws AppError - With code `"bad_request"` when the skill name/path is invalid.
 * @throws AppError - With code `"env_invalid"` when the Agent Skills environment is invalid.
 * @throws AppError - When reading from a bundled (Blob/ZIP) skill fails.
 */
export async function readSkillFileForProject(
  input: Readonly<{ projectId: string; name: string; path: string }>,
): Promise<SkillReadFileResult> {
  const normalized = normalizeKey(input.name);
  if (!normalized) {
    throw new AppError("bad_request", 400, "Invalid skill name.");
  }

  const dbRow = await getProjectSkillByName(input.projectId, input.name);
  if (dbRow) {
    const bundle = getProjectSkillBundleRef(dbRow.metadata);
    if (!bundle) {
      return {
        error: `Skill '${input.name}' is project-defined and does not have files.`,
        ok: false,
      };
    }

    const content = await readBundledSkillFileFromBlob({
      blobPath: bundle.blobPath,
      relativePath: input.path,
    });

    return { content, name: dbRow.name, ok: true, path: input.path };
  }

  const skills = await listAvailableSkillsForProject(input.projectId);
  const fsSkill = skills.find(
    (skill) => skill.source === "fs" && normalizeKey(skill.name) === normalized,
  );
  if (!fsSkill) {
    return { error: `Skill '${input.name}' not found.`, ok: false };
  }

  const content = await readFilesystemSkillFile({
    relativePath: input.path,
    skillDirectory: fsSkill.location,
  });

  return { content, name: fsSkill.name, ok: true, path: input.path };
}
