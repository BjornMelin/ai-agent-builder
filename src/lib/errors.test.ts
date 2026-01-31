import { describe, expect, it, vi } from "vitest";

describe("errors", () => {
  async function loadErrors() {
    vi.resetModules();
    return await import("@/lib/errors");
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

  it("returns NextResponse JSON error with correct status", async () => {
    const { AppError, jsonError } = await loadErrors();
    const err = new AppError("not_found", 404, "Missing");

    const res = jsonError(err);
    expect(res.status).toBe(404);

    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Missing" },
    });
  });

  it("returns generic 500 JSON error for unknown errors", async () => {
    const { jsonError } = await loadErrors();
    const res = jsonError(new Error("boom"));
    expect(res.status).toBe(500);

    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Unexpected error." },
    });
  });

  it("creates JSON success responses", async () => {
    const { jsonCreated, jsonOk, noContent } = await loadErrors();

    const ok = jsonOk({ ok: true });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toEqual({ ok: true });

    const created = jsonCreated({ id: "1" });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toEqual({ id: "1" });

    const empty = noContent();
    expect(empty.status).toBe(204);
    expect(await empty.text()).toBe("");
  });
});
