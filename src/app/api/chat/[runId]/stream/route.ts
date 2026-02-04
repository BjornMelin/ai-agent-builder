import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { jsonError } from "@/lib/next/responses";

const START_INDEX_PATTERN = /^\d+$/;

const parseStartIndex = (startIndexRaw: string | null) => {
  if (startIndexRaw === null) {
    return undefined;
  }

  if (!START_INDEX_PATTERN.test(startIndexRaw)) {
    throw new AppError("bad_request", 400, "Invalid startIndex.");
  }

  const parsed = Number.parseInt(startIndexRaw, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError("bad_request", 400, "Invalid startIndex.");
  }

  return parsed;
};

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
    await requireAppUserApi();
    const params = await context.params;
    const { searchParams } = new URL(req.url);
    const startIndex = parseStartIndex(searchParams.get("startIndex"));
    const { runId } = params;

    const run = getRun(runId);
    const stream = run.getReadable({
      ...(startIndex === undefined ? {} : { startIndex }),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return jsonError(err);
  }
}
