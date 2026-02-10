import "server-only";

import {
  getProjectSkillByName,
  listProjectSkillsByProject,
} from "@/lib/data/project-skills.server";
import { stripSkillFrontmatter } from "./frontmatter";
import type { SkillMetadata } from "./types";

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * List project-defined skills stored in the database.
 *
 * @param projectId - Project identifier.
 * @returns Skill metadata list.
 */
export async function listDatabaseSkills(
  projectId: string,
): Promise<SkillMetadata[]> {
  const rows = await listProjectSkillsByProject(projectId);
  return rows.map((row) => ({
    description: row.description,
    location: `db:${row.id}`,
    name: row.name,
    source: "db",
  }));
}

/**
 * Load a database skill by name (case-insensitive).
 *
 * @param projectId - Project identifier.
 * @param name - Skill name.
 * @returns Skill metadata and body, or null when not found.
 */
export async function loadDatabaseSkillByName(
  projectId: string,
  name: string,
): Promise<Readonly<{
  name: string;
  description: string;
  location: string;
  content: string;
}> | null> {
  const normalized = normalizeKey(name);
  if (!normalized) return null;

  const row = await getProjectSkillByName(projectId, normalized);
  if (!row) return null;

  return {
    content: stripSkillFrontmatter(row.content),
    description: row.description,
    location: `db:${row.id}`,
    name: row.name,
  };
}
