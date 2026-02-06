import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { cancelProjectRun } from "@/lib/runs/project-run.server";

/**
 * Cancel an in-flight durable run.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 * @throws AppError - With code "not_found" when the run cannot be found.
 */
export async function POST(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [user, params] = await Promise.all([authPromise, paramsPromise]);

    await cancelProjectRun(params.runId, user.id);

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
