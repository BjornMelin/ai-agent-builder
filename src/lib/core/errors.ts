/**
 * Stable, app-specific error codes.
 *
 * Keep codes lowercase + snake_case so they are safe for logs, URLs, and UIs.
 */
export type AppErrorCode = string;

/**
 * A structured application error intended for consistent user-facing responses.
 *
 * @example
 * ```ts
 * throw new AppError("bad_request", 400, "Missing input")
 * ```
 */
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;

  /**
   * Create an {@link AppError}.
   *
   * @param code - Stable application error code.
   * @param status - HTTP status code.
   * @param message - User-facing message (kept intentionally brief).
   * @param cause - Underlying error (not automatically exposed to clients).
   */
  public constructor(
    code: AppErrorCode,
    status: number,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Returns `true` if the value is an {@link AppError}.
 *
 * @param value - Unknown value.
 * @returns `true` if {@link value} is an {@link AppError}.
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * A JSON-safe error payload used in API responses and server actions.
 */
export type JsonError = Readonly<{
  error: Readonly<{
    code: AppErrorCode;
    message: string;
  }>;
}>;

/**
 * Returns `true` if the value matches the app's standard JSON error shape.
 *
 * @param value - Unknown JSON value.
 * @returns `true` if {@link value} is a {@link JsonError}.
 */
export function isJsonError(value: unknown): value is JsonError {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const err = v.error;
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return typeof e.code === "string" && typeof e.message === "string";
}

/**
 * Best-effort extraction of `{ error: { message } }` from a JSON response.
 *
 * @remarks
 * This function consumes the response body via {@link Response.json}. Only call
 * it in the branch where you won't read the body again.
 *
 * @param res - Fetch response.
 * @returns The server-provided error message, or `null` if unavailable.
 */
export async function tryReadJsonErrorMessage(
  res: Response,
): Promise<string | null> {
  try {
    const jsonUnknown: unknown = await res.json();
    return isJsonError(jsonUnknown) ? jsonUnknown.error.message : null;
  } catch {
    return null;
  }
}

/**
 * A JSON-safe return type for Server Actions.
 */
export type ActionResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; error: JsonError["error"] }>;

/**
 * Create a successful Server Action result.
 *
 * @param data - Successful payload.
 * @returns A JSON-safe success result.
 */
export function actionOk<T>(data: T): ActionResult<T> {
  return { data, ok: true };
}

/**
 * Create a failed Server Action result.
 *
 * Non-{@link AppError} values are normalized to a generic error message.
 *
 * @param err - Unknown error.
 * @returns A JSON-safe error result.
 */
export function actionErr(err: unknown): ActionResult<never> {
  const normalized = normalizeError(err);
  return {
    error: { code: normalized.code, message: normalized.message },
    ok: false,
  };
}

/**
 * Normalize an unknown thrown value to an {@link AppError}-like shape.
 *
 * Non-{@link AppError} values intentionally do not leak their messages.
 *
 * @param err - Unknown error.
 * @returns Normalized error shape.
 */
export function normalizeError(err: unknown): Readonly<{
  code: AppErrorCode;
  status: number;
  message: string;
  cause?: unknown;
}> {
  if (isAppError(err)) {
    return {
      cause: err.cause,
      code: err.code,
      message: err.message,
      status: err.status,
    };
  }

  return {
    cause: err,
    code: "internal_error",
    message: "Unexpected error.",
    status: 500,
  };
}
