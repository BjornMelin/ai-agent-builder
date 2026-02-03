import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { env } from "@/lib/env";
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
    const raw = await req.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      throw new AppError("bad_request", 400, "Invalid JSON body.", err);
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("bad_request", 400, "Invalid request body.");
    }

    const origin = env.app.baseUrl;

    const result = await executeRunStep({
      origin,
      runId: parsed.data.runId,
      stepId: parsed.data.stepId,
    });

    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
});
