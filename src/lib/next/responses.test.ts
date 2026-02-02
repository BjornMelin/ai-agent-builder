import { describe, expect, it, vi } from "vitest";

describe("next/responses", () => {
  async function loadResponses() {
    vi.resetModules();
    return await import("@/lib/next/responses");
  }

  it("returns NextResponse JSON error with correct status", async () => {
    const { jsonError } = await loadResponses();
    const { AppError } = await import("@/lib/core/errors");
    const err = new AppError("not_found", 404, "Missing");

    const res = jsonError(err);
    expect(res.status).toBe(404);

    await expect(res.json()).resolves.toEqual({
      error: { code: "not_found", message: "Missing" },
    });
  });

  it("returns generic 500 JSON error for unknown errors", async () => {
    const { jsonError } = await loadResponses();
    const res = jsonError(new Error("boom"));
    expect(res.status).toBe(500);

    await expect(res.json()).resolves.toEqual({
      error: { code: "internal_error", message: "Unexpected error." },
    });
  });

  it("creates JSON success responses", async () => {
    const { jsonCreated, jsonOk, noContent } = await loadResponses();

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
