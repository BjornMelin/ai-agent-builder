import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { jsonError } from "@/lib/next/responses";

const startIndexSchema = z.coerce.number().int().min(0).optional();

/**
 * Reconnect to an existing chat stream.
 *
 * @remarks
 * The client provides `startIndex` so we can resume without duplicating chunks.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns UI message stream response or JSON error.
 * @throws AppError - When `startIndex` is invalid.
 */
export async function GET(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const { searchParams } = new URL(req.url);

    const startIndexRaw = searchParams.get("startIndex") ?? undefined;
    const parsed = startIndexSchema.safeParse(startIndexRaw);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid startIndex.");
    }

    const [params] = await Promise.all([paramsPromise, authPromise]);
    const { runId } = params;

    const run = getRun(runId);
    const stream = run.getReadable({
      ...(parsed.data === undefined ? {} : { startIndex: parsed.data }),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return jsonError(err);
  }
}
