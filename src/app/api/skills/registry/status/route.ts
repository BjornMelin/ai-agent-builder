import { getRun } from "workflow/api";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { assertProjectOwnsRegistryInstallRun } from "@/lib/data/project-skill-registry-installs.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { jsonError, jsonOk } from "@/lib/next/responses";

const querySchema = z.strictObject({
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

/**
 * Check the status of a skills registry install workflow run.
 *
 * @param req - HTTP request.
 * @returns Workflow run status or JSON error.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      projectId: searchParams.get("projectId") ?? "",
      runId: searchParams.get("runId") ?? "",
    });
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid status query.");
    }

    const user = await requireAppUserApi();
    const project = await getProjectByIdForUser(parsed.data.projectId, user.id);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    await assertProjectOwnsRegistryInstallRun({
      projectId: project.id,
      workflowRunId: parsed.data.runId,
    });

    let run: ReturnType<typeof getRun>;
    try {
      run = getRun(parsed.data.runId);
    } catch (error) {
      throw new AppError("not_found", 404, "Run not found.", error);
    }

    const status = await run.status;
    return jsonOk({ runId: parsed.data.runId, status });
  } catch (err) {
    return jsonError(err);
  }
}
