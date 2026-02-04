import { z } from "zod";

import { env } from "@/lib/env";
import { parseJsonBody } from "@/lib/next/parse-json-body.server";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { executeRunStep } from "@/lib/runs/run-engine.server";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  runId: z.string().min(1),
  stepId: z.string().min(1),
});

/**
 * Execute a single step of a durable run.
 *
 * @remarks
 * This route is protected by QStash signature verification and processes
 * run steps enqueued by the run engine.
 *
 * @param req - HTTP request containing runId and stepId in JSON body.
 * @returns JSON response with step execution result or error.
 * @throws AppError - When JSON body is malformed (400).
 * @throws AppError - When request body validation fails (400).
 */
export const POST = verifyQstashSignatureAppRouter(async (req: Request) => {
  try {
    const parsed = await parseJsonBody(req, bodySchema);

    const origin = env.app.baseUrl;

    const result = await executeRunStep({
      origin,
      runId: parsed.runId,
      stepId: parsed.stepId,
    });

    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
});
