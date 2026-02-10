import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/core/errors";
import {
  isPostgresErrorCode,
  isUndefinedColumnError,
  isUndefinedTableError,
  maybeWrapDbNotMigrated,
} from "@/lib/db/postgres-errors";

describe("postgres error helpers", () => {
  it("isPostgresErrorCode returns false for non-objects", () => {
    expect(isPostgresErrorCode(null, "42P01")).toBe(false);
    expect(isPostgresErrorCode(undefined, "42P01")).toBe(false);
    expect(isPostgresErrorCode("x", "42P01")).toBe(false);
    expect(isPostgresErrorCode(123, "42P01")).toBe(false);
  });

  it("isPostgresErrorCode matches on SQLSTATE code", () => {
    expect(isPostgresErrorCode({ code: "42P01" }, "42P01")).toBe(true);
    expect(isPostgresErrorCode({ code: "42703" }, "42P01")).toBe(false);
  });

  it("isUndefinedTableError matches 42P01", () => {
    expect(isUndefinedTableError({ code: "42P01" })).toBe(true);
    expect(isUndefinedTableError({ code: "42703" })).toBe(false);
  });

  it("isUndefinedColumnError matches 42703", () => {
    expect(isUndefinedColumnError({ code: "42703" })).toBe(true);
    expect(isUndefinedColumnError({ code: "42P01" })).toBe(false);
  });

  it("maybeWrapDbNotMigrated wraps undefined table/column errors into db_not_migrated AppError", () => {
    const undefinedTable = { code: "42P01" };
    const wrappedTable = maybeWrapDbNotMigrated(undefinedTable);
    expect(wrappedTable).toBeInstanceOf(AppError);
    expect((wrappedTable as AppError).code).toBe("db_not_migrated");
    expect((wrappedTable as AppError).status).toBe(500);
    expect((wrappedTable as AppError).cause).toBe(undefinedTable);

    const undefinedColumn = { code: "42703" };
    const wrappedColumn = maybeWrapDbNotMigrated(undefinedColumn);
    expect(wrappedColumn).toBeInstanceOf(AppError);
    expect((wrappedColumn as AppError).code).toBe("db_not_migrated");
    expect((wrappedColumn as AppError).status).toBe(500);
    expect((wrappedColumn as AppError).cause).toBe(undefinedColumn);
  });

  it("maybeWrapDbNotMigrated preserves non-migration errors unchanged", () => {
    const err = { code: "23505", detail: "Unique constraint" };
    expect(maybeWrapDbNotMigrated(err)).toBe(err);
  });

  it("maybeWrapDbNotMigrated applies the optional message override", () => {
    const original = { code: "42P01" };
    const wrapped = maybeWrapDbNotMigrated(original, "Custom migrate message");
    expect(wrapped).toBeInstanceOf(AppError);
    expect((wrapped as AppError).message).toBe("Custom migrate message");
  });
});
