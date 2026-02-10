import { cancelRun, getWorld } from "@workflow/core/runtime";
import { start } from "workflow/api";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { recordProjectSkillRegistryInstall } from "@/lib/data/project-skill-registry-installs.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { installProjectSkillFromRegistry } from "@/workflows/skills-registry/project-skill-registry.workflow";

const bodySchema = z.strictObject({
  projectId: z.string().min(1),
  registryId: z.string().min(1),
});

/**
 * Install a skills.sh registry skill into a project (durable workflow).
 *
 * @param req - HTTP request.
 * @returns Workflow run id (202 Accepted) or JSON error.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, bodySchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    const project = await getProjectByIdForUser(body.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    const world = getWorld();
    const run = await start(
      installProjectSkillFromRegistry,
      [project.id, body.registryId],
      { world },
    );

    // Bind workflow run IDs to a project to prevent cross-project status probing.
    try {
      await recordProjectSkillRegistryInstall({
        projectId: project.id,
        registryId: body.registryId,
        workflowRunId: run.runId,
      });
    } catch (err) {
      // Prevent orphaned runs that can't be status-polled due to ownership enforcement.
      await cancelRun(world, run.runId).catch(() => undefined);
      throw err;
    }

    return jsonOk(
      {
        ok: true,
        runId: run.runId,
      },
      { status: 202 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
