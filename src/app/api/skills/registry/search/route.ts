import { z } from "zod";
import { listAvailableSkillsForProject } from "@/lib/ai/skills/index.server";
import { getProjectSkillRegistryRef } from "@/lib/ai/skills/project-skill-metadata.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { listProjectSkillsByProject } from "@/lib/data/project-skills.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { searchSkillsShRegistry } from "@/lib/skills-registry/skills-sh-search.server";

const querySchema = z.strictObject({
  limit: z.string().optional(),
  projectId: z.string().min(1),
  q: z.string().min(1),
});

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new AppError("bad_request", 400, "Invalid limit.");
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError("bad_request", 400, "Invalid limit.");
  }
  return parsed;
}

/**
 * Search for skills in the public skills.sh registry.
 *
 * @param req - HTTP request.
 * @returns Search results annotated with install state.
 * @throws AppError - With code `"bad_request"` when the query is invalid (e.g. missing `projectId`/`q` or invalid `limit`).
 * @throws AppError - With code `"forbidden"` when the project is not accessible to the current user.
 * @throws AppError - With code `"upstream_failed"` when the registry lookup fails upstream.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      limit: searchParams.get("limit") ?? undefined,
      projectId: searchParams.get("projectId") ?? "",
      q: searchParams.get("q") ?? "",
    });
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid registry search query.");
    }

    const user = await requireAppUserApi();
    const project = await getProjectByIdForUser(parsed.data.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const limit = parseLimit(parsed.data.limit);
    const [results, projectSkills, effectiveSkills] = await Promise.all([
      searchSkillsShRegistry(parsed.data.q, {
        ...(limit !== undefined ? { limit } : {}),
      }),
      listProjectSkillsByProject(project.id),
      listAvailableSkillsForProject(project.id),
    ]);

    const installedByName = new Map<
      string,
      Readonly<{
        id: string;
        origin: "manual" | "registry";
        registryId: string | null;
      }>
    >();

    for (const skill of projectSkills) {
      const key = normalizeKey(skill.name);
      if (!key) continue;
      const registryRef = getProjectSkillRegistryRef(skill.metadata);
      installedByName.set(key, {
        id: skill.id,
        origin: registryRef ? "registry" : "manual",
        registryId: registryRef?.id ?? null,
      });
    }

    const effectiveByName = new Map<string, "db" | "fs">();
    for (const skill of effectiveSkills) {
      const key = normalizeKey(skill.name);
      if (!key) continue;
      effectiveByName.set(key, skill.source);
    }

    const skills = results.skills.map((skill) => {
      const key = normalizeKey(skill.name);
      const installed = key ? (installedByName.get(key) ?? null) : null;
      const effective = key ? (effectiveByName.get(key) ?? null) : null;
      return {
        effectiveSource: effective,
        id: skill.id,
        installed: installed !== null,
        installedOrigin: installed?.origin ?? null,
        installedRegistryId: installed?.registryId ?? null,
        installedSkillId: installed?.id ?? null,
        installs: skill.installs,
        name: skill.name,
        skillId: skill.skillId,
        source: skill.source,
      };
    });

    return jsonOk({ query: results.query, skills });
  } catch (err) {
    return jsonError(err);
  }
}
