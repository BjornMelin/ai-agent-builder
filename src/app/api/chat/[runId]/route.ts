import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
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
 * @throws AppError - When the request body is invalid.
 */
export async function POST(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
) {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const bodyPromise = parseJsonBody(req, bodySchema);

    const [params, parsed] = await Promise.all([paramsPromise, bodyPromise]);
    await authPromise;

    await chatMessageHook.resume(params.runId, { message: parsed.message });

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
