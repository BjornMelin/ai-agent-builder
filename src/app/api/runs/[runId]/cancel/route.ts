import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import { getRunById } from "@/lib/data/runs.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { cancelProjectRun } from "@/lib/runs/project-run.server";

/**
 * Cancel an in-flight durable run.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 * @throws AppError - With code "not_found" when the run cannot be found.
 * @throws AppError - With code "forbidden" when the run's project is not accessible.
 */
export async function POST(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [, params] = await Promise.all([authPromise, paramsPromise]);

    const persistedRun = await getRunById(params.runId);
    if (!persistedRun) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    const project = await getProjectById(persistedRun.projectId);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    await cancelProjectRun(params.runId);

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
