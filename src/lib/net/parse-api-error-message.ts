function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse a JSON API error response body into a user-friendly message.
 *
 * @remarks
 * This helper is safe to call on both the client and server. It tolerates
 * non-JSON responses and unknown payload shapes.
 *
 * @param response - HTTP response to parse.
 * @param fallback - Message returned when parsing fails or no message is present.
 * @returns Resolved error message.
 */
export async function parseApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (!payload || !isRecord(payload)) return fallback;
  const error = payload.error;
  if (!error || !isRecord(error)) return fallback;
  const message = error.message;
  return typeof message === "string" && message.trim().length > 0
    ? message
    : fallback;
}
