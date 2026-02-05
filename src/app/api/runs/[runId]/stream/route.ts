import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import { getRunById } from "@/lib/data/runs.server";
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
 * Reconnect to an existing run stream.
 *
 * @remarks
 * The client provides `startIndex` so we can resume without duplicating chunks.
 *
 * @param req - HTTP request.
 * @param context - Route params.
 * @returns UI message stream response or JSON error.
 * @throws AppError - With code "bad_request" when `startIndex` is invalid.
 * @throws AppError - With code "not_found" when the run cannot be found.
 * @throws AppError - With code "forbidden" when the run's project is not accessible.
 * @throws AppError - With code "conflict" when the run is not backed by Workflow DevKit.
 */
export async function GET(
  req: Request,
  context: Readonly<{ params: Promise<{ runId: string }> }>,
): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const paramsPromise = context.params;
    const [, params] = await Promise.all([authPromise, paramsPromise]);

    const { searchParams } = new URL(req.url);
    const startIndex = parseStartIndex(searchParams.get("startIndex"));
    const { runId } = params;

    const persistedRun = await getRunById(runId);
    if (!persistedRun) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    const project = await getProjectById(persistedRun.projectId);
    if (!project) {
      throw new AppError("forbidden", 403, "Forbidden.");
    }

    if (!persistedRun.workflowRunId) {
      throw new AppError("conflict", 409, "Run stream is not available.");
    }

    const run = getRun(persistedRun.workflowRunId);
    if (!run) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    const stream = run.getReadable({
      ...(startIndex === undefined ? {} : { startIndex }),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return jsonError(err);
  }
}
