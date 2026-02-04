import { z } from "zod";

import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { getProjectById } from "@/lib/data/projects.server";
import {
  createRun,
  ensureRunStep,
  updateRunStatus,
  updateRunStepStatus,
} from "@/lib/data/runs.server";
import { env } from "@/lib/env";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
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
 * @throws AppError - When request body is invalid (400).
 * @throws AppError - When project is not found (404).
 * @throws AppError - When callback origin configuration is invalid.
 */
export async function POST(req: Request) {
  try {
    const authPromise = requireAppUserApi();
    const bodyPromise = parseJsonBody(req, createRunSchema);
    await authPromise;

    const parsed = await bodyPromise;

    const project = await getProjectById(parsed.projectId);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const callbackOrigin = env.app.baseUrl;
    const run = await createRun({
      kind: parsed.kind,
      projectId: parsed.projectId,
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    });

    await ensureRunStep({
      runId: run.id,
      stepId: "run.start",
      stepKind: "tool",
      stepName: "Start run",
    });

    try {
      await enqueueRunStep({
        origin: callbackOrigin,
        runId: run.id,
        stepId: "run.start",
      });
    } catch (error) {
      await Promise.all([
        updateRunStatus(run.id, "blocked"),
        updateRunStepStatus(run.id, "run.start", "blocked"),
      ]);
      throw error;
    }

    return jsonCreated(run);
  } catch (err) {
    return jsonError(err);
  }
}
