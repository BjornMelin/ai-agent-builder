import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import type { RunDto } from "@/lib/data/runs.server";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonCreated, jsonError, jsonOk } from "@/lib/next/responses";
import {
  getActiveProjectCodeModeRun,
  getCodeModeRun,
  startProjectCodeMode,
} from "@/lib/runs/code-mode.server";

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
  runId: z.uuid(),
});

const discoverCodeModeSchema = z.strictObject({
  projectId: z.string().min(1),
  runId: z.uuid().optional(),
});

function toRunPayload(run: RunDto) {
  return {
    network:
      run.metadata.networkAccess === "restricted" ? "restricted" : "none",
    projectId: run.projectId,
    prompt: typeof run.metadata.prompt === "string" ? run.metadata.prompt : "",
    runId: run.id,
    status: run.status,
    workflowRunId: run.workflowRunId,
  } as const;
}

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
      runId: body.runId,
      userId: user.id,
    });

    return jsonCreated(
      toRunPayload(run),
      run.workflowRunId
        ? { headers: { "x-workflow-run-id": run.workflowRunId } }
        : undefined,
    );
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Discover a known or currently active authenticated Code Mode run.
 *
 * @param req - HTTP request containing project and optional run IDs.
 * @returns Authenticated run payload or JSON error.
 * @throws AppError - With code "bad_request" when query validation fails.
 * @throws AppError - With code "not_found" when a run belongs to another project.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireAppUserApi();
    const url = new URL(req.url);
    const parsed = discoverCodeModeSchema.safeParse({
      projectId: url.searchParams.get("projectId") ?? "",
      runId: url.searchParams.get("runId") ?? undefined,
    });
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid Code Mode query.");
    }

    const run = parsed.data.runId
      ? await getCodeModeRun(parsed.data.runId, user.id)
      : await getActiveProjectCodeModeRun(parsed.data.projectId, user.id);
    if (run && run.projectId !== parsed.data.projectId) {
      throw new AppError("not_found", 404, "Run not found.");
    }

    return jsonOk({ run: run ? toRunPayload(run) : null });
  } catch (err) {
    return jsonError(err);
  }
}
