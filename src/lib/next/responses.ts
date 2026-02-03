import "server-only";

import { NextResponse } from "next/server";

import type { JsonError } from "@/lib/core/errors";
import { normalizeError } from "@/lib/core/errors";

type JsonResponseInit = Parameters<typeof NextResponse.json>[1];
type EmptyResponseInit = ConstructorParameters<typeof Response>[1];

/**
 * Convert an error to a consistent {@link NextResponse} JSON error response.
 *
 * @param err - Unknown error.
 * @returns JSON error response.
 */
export function jsonError(err: unknown): NextResponse<JsonError> {
  const normalized = normalizeError(err);
  return NextResponse.json(
    {
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    },
    { status: normalized.status },
  );
}

/**
 * Create a JSON {@link NextResponse} for successful Route Handlers.
 *
 * @param data - JSON payload.
 * @param init - Optional response init.
 * @returns JSON response.
 */
export function jsonOk<T>(data: T, init?: JsonResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

/**
 * Create a JSON {@link NextResponse} for resource creation.
 *
 * @param data - JSON payload.
 * @param init - Optional response init.
 * @returns JSON response with status 201.
 */
export function jsonCreated<T>(
  data: T,
  init?: JsonResponseInit,
): NextResponse<T> {
  return NextResponse.json(data, { ...init, status: 201 });
}

/**
 * Create an empty 204 response.
 *
 * @param init - Optional response init.
 * @returns Response with status 204 and no body.
 */
export function noContent(init?: EmptyResponseInit): Response {
  return new Response(null, { ...init, status: 204 });
}
