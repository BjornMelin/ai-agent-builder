import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { jsonError } from "@/lib/next/responses";
import { getCodeModeRun } from "@/lib/runs/code-mode.server";

const START_INDEX_PATTERN = /^\d+$/;

function parseStartIndex(startIndexRaw: string | null) {
  if (startIndexRaw === null) {
    return undefined;
  }

  if (!START_INDEX_PATTERN.test(startIndexRaw)) {
    throw new AppError("bad_request", 400, "Invalid startIndex.");
  }

  const parsed = Number.parseInt(startIndexRaw, 10);
  if (Number.isNaN(parsed)) {
    throw new AppError("bad_request", 400, "Invalid startIndex.");
  }
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError("bad_request", 400, "Invalid startIndex.");
  }

  return parsed;
}

/**
 * Reconnect to an existing Code Mode stream.
 *
 * @remarks
 * The client provides `startIndex` so we can resume without duplicating chunks.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns UI message stream response or JSON error.
 */
export async function GET(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [user, params] = await Promise.all([authPromise, paramsPromise]);

    const { searchParams } = new URL(req.url);
    const startIndex = parseStartIndex(searchParams.get("startIndex"));

    const run = await getCodeModeRun(params.runId, user.id);
    if (!run.workflowRunId) {
      throw new AppError("conflict", 409, "Run stream is not available.");
    }

    const workflowRun = getRun(run.workflowRunId);
    const stream = workflowRun.getReadable({
      ...(startIndex === undefined ? {} : { startIndex }),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return jsonError(err);
  }
}
