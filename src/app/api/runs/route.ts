import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import { createRun, ensureRunStep } from "@/lib/data/runs.server";
import { env } from "@/lib/env";
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
 * @throws AppError - When request body is invalid (400).
 * @throws AppError - When project is not found (404).
 * @throws AppError - When callback origin configuration is invalid.
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

    const callbackOrigin = env.app.baseUrl;
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

    await enqueueRunStep({
      origin: callbackOrigin,
      runId: run.id,
      stepId: "run.start",
    });

    return jsonCreated(run);
  } catch (err) {
    return jsonError(err);
  }
}
