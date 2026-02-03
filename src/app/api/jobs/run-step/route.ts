import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { getRequestOrigin } from "@/lib/next/request-origin";
import { jsonError, jsonOk } from "@/lib/next/responses";
import { executeRunStep } from "@/lib/runs/run-engine.server";
import { verifyQstashSignatureAppRouter } from "@/lib/upstash/qstash.server";

const bodySchema = z.strictObject({
  runId: z.string().min(1),
  stepId: z.string().min(1),
});

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

    const origin = getRequestOrigin(req.headers);
    if (!origin) {
      throw new AppError(
        "bad_request",
        400,
        "Unable to determine request origin.",
      );
    }

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
