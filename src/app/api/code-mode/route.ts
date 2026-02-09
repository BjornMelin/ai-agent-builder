import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError } from "@/lib/next/responses";
import { startProjectCodeMode } from "@/lib/runs/code-mode.server";

const budgetsSchema = z
  .strictObject({
    maxSteps: z.number().int().min(1).max(50).optional(),
    timeoutMs: z
      .number()
      .int()
      .min(1)
      .max(30 * 60_000)
      .optional(),
  })
  .optional();

const startCodeModeSchema = z.strictObject({
  budgets: budgetsSchema,
  network: z.enum(["none", "restricted"]).optional(),
  projectId: z.string().min(1),
  prompt: z.string().min(1),
});

/**
 * Start a Code Mode session backed by Workflow DevKit + Vercel Sandbox.
 *
 * @param req - HTTP request.
 * @returns Run identity payload or JSON error.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, startCodeModeSchema);
    const [user, body] = await Promise.all([authPromise, bodyPromise]);

    const budgets =
      body.budgets === undefined
        ? undefined
        : {
            ...(body.budgets.maxSteps === undefined
              ? {}
              : { maxSteps: body.budgets.maxSteps }),
            ...(body.budgets.timeoutMs === undefined
              ? {}
              : { timeoutMs: body.budgets.timeoutMs }),
          };

    const run = await startProjectCodeMode({
      budgets,
      networkAccess: body.network,
      projectId: body.projectId,
      prompt: body.prompt,
      userId: user.id,
    });

    if (!run.workflowRunId) {
      throw new AppError(
        "db_update_failed",
        500,
        "Failed to persist workflow run id.",
      );
    }

    return jsonCreated(
      { runId: run.id, workflowRunId: run.workflowRunId },
      { headers: { "x-workflow-run-id": run.workflowRunId } },
    );
  } catch (err) {
    return jsonError(err);
  }
}
