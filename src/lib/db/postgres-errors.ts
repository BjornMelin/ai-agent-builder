import "server-only";

/**
 * Returns `true` if the value looks like a Postgres error with a SQLSTATE code.
 * Drizzle/pg surface Postgres errors as objects with a `code` field (SQLSTATE).
 *
 * @param err - Unknown thrown error.
 * @param code - SQLSTATE code to match.
 * @returns `true` if {@link err} has the provided SQLSTATE code.
 */
export function isPostgresErrorCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") return false;
  const value = err as { code?: unknown };
  return value.code === code;
}

/**
 * SQLSTATE 42P01: undefined_table.
 *
 * @param err - Unknown thrown error.
 * @returns `true` if {@link err} is a Postgres "undefined table" error.
 */
export function isUndefinedTableError(err: unknown): boolean {
  return isPostgresErrorCode(err, "42P01");
}
