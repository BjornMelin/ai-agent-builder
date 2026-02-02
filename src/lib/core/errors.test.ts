import { describe, expect, it, vi } from "vitest";

describe("core/errors", () => {
  async function loadErrors() {
    vi.resetModules();
    return await import("@/lib/core/errors");
  }

  it("normalizes AppError as-is", async () => {
    const { AppError, normalizeError } = await loadErrors();
    const err = new AppError("bad_request", 400, "Nope");

    expect(normalizeError(err)).toMatchObject({
      code: "bad_request",
      message: "Nope",
      status: 400,
    });
  });

  it("normalizes unknown errors to generic payload", async () => {
    const { normalizeError } = await loadErrors();
    expect(normalizeError(new Error("secret"))).toMatchObject({
      code: "internal_error",
      message: "Unexpected error.",
      status: 500,
    });
  });

  it("builds JSON-safe server action results", async () => {
    const { AppError, actionErr, actionOk } = await loadErrors();
    expect(actionOk({ value: 1 })).toEqual({ data: { value: 1 }, ok: true });
    expect(actionErr(new Error("boom"))).toEqual({
      error: { code: "internal_error", message: "Unexpected error." },
      ok: false,
    });
    expect(actionErr(new AppError("nope", 400, "Nope"))).toEqual({
      error: { code: "nope", message: "Nope" },
      ok: false,
    });
  });
});
