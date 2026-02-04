import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { chatMessageHook } from "@/workflows/chat/hooks/chat-message";

const bodySchema = z.strictObject({
  message: z.string().min(1),
});

/**
 * Resume an in-flight multi-turn chat run by injecting a follow-up message.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns JSON ok or JSON error.
 */
export async function POST(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
) {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const bodyPromise = req.json().catch(() => null);
    const [params, raw] = await Promise.all([
      paramsPromise,
      bodyPromise,
      authPromise,
    ]).then(([resolvedParams, resolvedBody]) => [
      resolvedParams as { runId: string },
      resolvedBody,
    ]);
    const { runId } = params;
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    await chatMessageHook.resume(runId, { message: parsed.data.message });

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
