import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import { createRun, ensureRunStep } from "@/lib/data/runs.server";
import { getRequestOrigin } from "@/lib/next/request-origin";
import { jsonCreated, jsonError } from "@/lib/next/responses";
import { enqueueRunStep } from "@/lib/runs/run-engine.server";

const createRunSchema = z.strictObject({
  kind: z.enum(["research", "implementation"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  projectId: z.string().min(1),
});

/**
 * Create a new run for a project and enqueue its first step.
 *
 * @param req - HTTP request.
 * @returns Run response or JSON error.
 */
export async function POST(req: Request) {
  try {
    await requireAppUserApi();

    const body = await req.json().catch(() => null);
    const parsed = createRunSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const project = await getProjectById(parsed.data.projectId);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const run = await createRun({
      kind: parsed.data.kind,
      projectId: parsed.data.projectId,
      ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {}),
    });

    await ensureRunStep({
      runId: run.id,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
    });

    const origin = getRequestOrigin(req.headers);
    if (!origin) {
      throw new AppError(
        "bad_request",
        400,
        "Unable to determine request origin.",
      );
    }

    await enqueueRunStep({ origin, runId: run.id, stepId: "run.start" });

    return jsonCreated(run);
  } catch (err) {
    return jsonError(err);
  }
}
