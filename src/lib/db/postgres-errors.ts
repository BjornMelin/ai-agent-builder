import "server-only";

import { AppError } from "@/lib/core/errors";

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

/**
 * SQLSTATE 42703: undefined_column.
 *
 * @param err - Unknown thrown error.
 * @returns `true` if {@link err} is a Postgres "undefined column" error.
 */
export function isUndefinedColumnError(err: unknown): boolean {
  return isPostgresErrorCode(err, "42703");
}

const DEFAULT_DB_NOT_MIGRATED_MESSAGE =
  "Database is not migrated. Run migrations and refresh the page.";

/**
 * Wraps undefined table/column errors as a standardized `"db_not_migrated"` {@link AppError}.
 *
 * @param err - Unknown thrown error.
 * @param message - Optional override for the default user-facing message.
 * @returns The original error or a wrapped {@link AppError} for missing/out-of-date schema.
 */
export function maybeWrapDbNotMigrated(
  err: unknown,
  message?: string,
): unknown {
  if (isUndefinedTableError(err) || isUndefinedColumnError(err)) {
    return new AppError(
      "db_not_migrated",
      500,
      message ?? DEFAULT_DB_NOT_MIGRATED_MESSAGE,
      err,
    );
  }

  return err;
}
