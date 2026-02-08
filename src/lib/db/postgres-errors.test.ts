import { describe, expect, it } from "vitest";

import {
  isPostgresErrorCode,
  isUndefinedColumnError,
  isUndefinedTableError,
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
});
