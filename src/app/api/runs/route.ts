import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError } from "@/lib/next/responses";
import { startProjectRun } from "@/lib/runs/project-run.server";

const createRunSchema = z.strictObject({
  kind: z.enum(["research", "implementation"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().min(1),
});

/**
 * Create a new run for a project using Workflow DevKit.
 *
 * @param req - HTTP request.
 * @returns Run response or JSON error.
 * @throws AppError - When request body is invalid (400).
 * @throws AppError - When project is not found (404).
 * @throws AppError - When database update fails (500, code: db_update_failed).
 */
export async function POST(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, createRunSchema);
    const [, parsed] = await Promise.all([authPromise, bodyPromise]);

    const run = await startProjectRun({
      kind: parsed.kind,
      projectId: parsed.projectId,
      ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
    });

    if (!run.workflowRunId) {
      throw new AppError(
        "db_update_failed",
        500,
        "Failed to persist workflow run id.",
      );
    }

    return jsonCreated(run, {
      headers: { "x-workflow-run-id": run.workflowRunId },
    });
  } catch (err) {
    return jsonError(err);
  }
}
