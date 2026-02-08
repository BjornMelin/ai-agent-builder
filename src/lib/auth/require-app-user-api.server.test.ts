import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  env: {
    auth: {
      accessMode: "open" as "open" | "allowlist",
      allowedEmails: ["a@example.com"],
    },
  },
  getSession: vi.fn(),
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  getAuth: () => ({
    getSession: state.getSession,
  }),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
  normalizeEmail: state.normalizeEmail,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.env.auth.accessMode = "open";
  state.env.auth.allowedEmails = ["a@example.com"];
});

describe("requireAppUserApi", () => {
  it("throws 401 when no session user is present", async () => {
    state.getSession.mockResolvedValue({ data: null });

    const { requireAppUserApi } = await import(
      "@/lib/auth/require-app-user-api.server"
    );

    await expect(requireAppUserApi()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    } satisfies Partial<AppError>);
  });

  it("returns the session user when accessMode=open", async () => {
    state.getSession.mockResolvedValue({
      data: { user: { email: "X@Example.com", id: "user_1" } },
    });

    const { requireAppUserApi } = await import(
      "@/lib/auth/require-app-user-api.server"
    );
    const user = await requireAppUserApi();

    expect(user).toMatchObject({ id: "user_1" });
    expect(state.normalizeEmail).not.toHaveBeenCalled();
  });

  it("throws 403 when accessMode=allowlist and email is not allowed", async () => {
    state.env.auth.accessMode = "allowlist";
    state.getSession.mockResolvedValue({
      data: { user: { email: "nope@example.com", id: "user_1" } },
    });

    const { requireAppUserApi } = await import(
      "@/lib/auth/require-app-user-api.server"
    );

    await expect(requireAppUserApi()).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>);
  });

  it("returns the session user when accessMode=allowlist and email is allowed after normalization", async () => {
    state.env.auth.accessMode = "allowlist";
    state.env.auth.allowedEmails = ["a@example.com"];
    state.getSession.mockResolvedValue({
      data: { user: { email: "  A@Example.com  ", id: "user_1" } },
    });

    const { requireAppUserApi } = await import(
      "@/lib/auth/require-app-user-api.server"
    );
    const user = await requireAppUserApi();

    expect(user).toMatchObject({ id: "user_1" });
    expect(state.normalizeEmail).toHaveBeenCalledWith("  A@Example.com  ");
  });
});
