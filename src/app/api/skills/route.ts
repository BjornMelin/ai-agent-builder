import { del } from "@vercel/blob";
import { z } from "zod";

import { getProjectSkillBundleRef } from "@/lib/ai/skills/project-skill-metadata.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  deleteProjectSkill,
  getProjectSkillById,
  listProjectSkillsByProject,
  upsertProjectSkill,
} from "@/lib/data/project-skills.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { env } from "@/lib/env";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError, jsonOk } from "@/lib/next/responses";

const listQuerySchema = z.strictObject({
  projectId: z.string().min(1),
  skillId: z.string().min(1).optional(),
});

const upsertBodySchema = z.strictObject({
  body: z.string().min(1).max(512_000),
  description: z.string().min(1).max(10_000),
  name: z.string().min(1).max(128),
  projectId: z.string().min(1),
});

const deleteBodySchema = z.strictObject({
  projectId: z.string().min(1),
  skillId: z.string().min(1),
});

function buildSkillMarkdown(
  input: Readonly<{
    name: string;
    description: string;
    body: string;
  }>,
): string {
  const name = input.name.trim();
  const description = input.description.trim();
  const body = input.body.trim();

  return [
    "---",
    `name: ${JSON.stringify(name)}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

/**
 * List project-defined Agent Skills for a project.
 *
 * @param req - HTTP request.
 * @returns Skills list payload or JSON error.
 * @throws AppError - With code "bad_request" when query params are invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function GET(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const { searchParams } = new URL(req.url);
    const parsedQuery = listQuerySchema.safeParse({
      projectId: searchParams.get("projectId") ?? "",
      skillId: searchParams.get("skillId") ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new AppError("bad_request", 400, "Invalid skills query.");
    }

    const user = await authPromise;
    const { projectId, skillId } = parsedQuery.data;

    const project = await getProjectByIdForUser(projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    if (skillId) {
      const skill = await getProjectSkillById(project.id, skillId);
      if (!skill) {
        throw new AppError("not_found", 404, "Skill not found.");
      }

      const publicSkill = {
        content: skill.content,
        description: skill.description,
        id: skill.id,
        name: skill.name,
        updatedAt: skill.updatedAt,
      };

      return jsonOk({ skill: publicSkill });
    }

    const skills = await listProjectSkillsByProject(project.id);
    const publicSkills = skills.map((skill) => ({
      content: skill.content,
      description: skill.description,
      id: skill.id,
      name: skill.name,
      updatedAt: skill.updatedAt,
    }));
    return jsonOk({ skills: publicSkills });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Create or update a project-defined Agent Skill.
 *
 * @param req - HTTP request.
 * @returns Upserted skill record or JSON error.
 * @throws AppError - With code "bad_request" when body is invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function POST(req: Request) {
  let userId: string | null = null;
  let projectId: string | null = null;
  let skillName: string | null = null;
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, upsertBodySchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    userId = user.id;
    projectId = body.projectId;
    skillName = body.name;

    const project = await getProjectByIdForUser(body.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    log.info("project_skill_upsert_started", {
      projectId: project.id,
      userId: user.id,
    });

    const skill = await upsertProjectSkill({
      content: buildSkillMarkdown({
        body: body.body,
        description: body.description,
        name: body.name,
      }),
      description: body.description,
      name: body.name,
      projectId: project.id,
    });

    const publicSkill = {
      content: skill.content,
      description: skill.description,
      id: skill.id,
      name: skill.name,
      updatedAt: skill.updatedAt,
    };

    log.info("project_skill_upsert_succeeded", {
      projectId: project.id,
      skillId: skill.id,
      userId: user.id,
    });

    return jsonCreated({ skill: publicSkill });
  } catch (err) {
    log.error("project_skill_upsert_failed", {
      err,
      projectId,
      skillName,
      userId,
    });
    return jsonError(err);
  }
}

/**
 * Delete a project-defined Agent Skill by id.
 *
 * @param req - HTTP request.
 * @returns Ok payload or JSON error.
 * @throws AppError - With code "bad_request" when body is invalid.
 * @throws AppError - With code "forbidden" when the project is not accessible.
 */
export async function DELETE(req: Request) {
  let userId: string | null = null;
  let projectId: string | null = null;
  let skillId: string | null = null;
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, deleteBodySchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    userId = user.id;
    projectId = body.projectId;
    skillId = body.skillId;

    const project = await getProjectByIdForUser(body.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    log.info("project_skill_delete_started", {
      projectId: project.id,
      skillId: body.skillId,
      userId: user.id,
    });

    const skill = await getProjectSkillById(project.id, body.skillId);
    if (skill) {
      const bundle = getProjectSkillBundleRef(skill.metadata);
      if (bundle?.blobPath) {
        try {
          await del(bundle.blobPath, { token: env.blob.readWriteToken });
        } catch (error) {
          // Best-effort cleanup: blob deletion failures should not block DB deletion.
          log.error("project_skill_bundle_delete_failed", {
            err: error,
            projectId: project.id,
            skillId: body.skillId,
          });
        }
      }
    }

    await deleteProjectSkill({ projectId: project.id, skillId: body.skillId });
    log.info("project_skill_delete_succeeded", {
      projectId: project.id,
      skillId: body.skillId,
      userId: user.id,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    log.error("project_skill_delete_failed", {
      err,
      projectId,
      skillId,
      userId,
    });
    return jsonError(err);
  }
}
