import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    github: {
      token: null as string | null,
      webhookSecret: "secret_test" as string | null,
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/webhooks/github/route");
  return { POST: mod.POST };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/github", () => {
  it("returns not configured when secret is missing", async () => {
    const { POST } = await loadRoute();
    state.env.github.webhookSecret = null;

    const res = await POST(
      new Request("http://localhost/api/webhooks/github", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    expect(res.status).toBe(501);
  });

  it("rejects missing signature", async () => {
    const { POST } = await loadRoute();
    state.env.github.webhookSecret = "secret_test";

    const res = await POST(
      new Request("http://localhost/api/webhooks/github", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    expect(res.status).toBe(401);
  });

  it("accepts valid signature", async () => {
    const { POST } = await loadRoute();
    state.env.github.webhookSecret = "secret_test";

    const body = JSON.stringify({ hello: "world" });
    const signature =
      "sha256=" +
      createHmac("sha256", "secret_test")
        .update(Buffer.from(body, "utf8"))
        .digest("hex");

    const res = await POST(
      new Request("http://localhost/api/webhooks/github", {
        body,
        headers: { "x-hub-signature-256": signature },
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});
