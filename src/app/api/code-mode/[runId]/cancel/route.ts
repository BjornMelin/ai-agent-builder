import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { cancelProjectCodeMode } from "@/lib/runs/code-mode.server";

/**
 * Cancel an in-flight Code Mode run.
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 */
export async function POST(
  _req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [user, params] = await Promise.all([authPromise, paramsPromise]);

    await cancelProjectCodeMode(params.runId, user.id);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
