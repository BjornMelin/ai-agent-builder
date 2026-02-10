/**
 * Workflow orchestration utilities.
 *
 * @remarks
 * Keep workflow-only helpers under `src/workflows/**` (not `src/lib/**`) to
 * preserve dependency direction: workflows depend on lib, not the other way
 * around.
 */

/**
 * Get a millisecond timestamp for workflow stream events.
 *
 * @returns Current timestamp in milliseconds since epoch.
 */
export function nowTimestamp(): number {
  return Date.now();
}

/**
 * Normalize an unknown error into a persisted step error payload.
 *
 * @param error - Unknown thrown value.
 * @returns Serializable step error payload.
 */
export function toStepErrorPayload(
  error: unknown,
): Readonly<Record<string, unknown>> {
  if (error instanceof Error) {
    return { message: error.message || "Failed." };
  }

  if (typeof error === "string" && error.length > 0) {
    return { message: error };
  }

  return { message: "Failed." };
}
