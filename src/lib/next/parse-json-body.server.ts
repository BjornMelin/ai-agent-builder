import "server-only";

import type { ZodType } from "zod";

import { AppError } from "@/lib/core/errors";

/**
 * Read and parse a JSON request body.
 *
 * @remarks
 * Next Route Handlers may receive malformed JSON bodies. This helper converts
 * those failures into a consistent {@link AppError} so callers can rely on
 * {@link jsonError} for stable error envelopes.
 *
 * Empty bodies are treated as `null` (matching the prior `req.json().catch(() => null)`
 * pattern used across route handlers).
 *
 * @param req - Incoming HTTP request.
 * @returns Parsed JSON value or `null` for empty bodies.
 * @throws AppError - With code "bad_request" (400) when JSON parsing fails.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new AppError("bad_request", 400, "Invalid JSON body.", err);
  }
}

/**
 * Parse and validate a JSON body using a Zod schema.
 *
 * @param req - Incoming HTTP request.
 * @param schema - Zod schema for validation.
 * @returns Validated data.
 * @throws AppError - With code "bad_request" (400) when validation fails.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<T> {
  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid request body.",
      parsed.error,
    );
  }
  return parsed.data;
}
