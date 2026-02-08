import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createNeonAuth: vi.fn(),
  env: {
    auth: {
      accessMode: "open",
      allowedEmails: ["a@example.com"],
      baseUrl: "https://auth.example.com",
      cookieDomain: "",
      cookieSecret: "secret",
    },
  },
}));

vi.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: state.createNeonAuth,
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("getAuth", () => {
  it("memoizes the Neon auth server instance and uses env cookie config", async () => {
    const auth = { getSession: vi.fn() };
    state.createNeonAuth.mockReturnValue(auth);

    const mod = await import("@/lib/auth/neon-auth.server");

    expect(mod.getAuth()).toBe(auth);
    expect(mod.getAuth()).toBe(auth);
    expect(state.createNeonAuth).toHaveBeenCalledTimes(1);
    expect(state.createNeonAuth).toHaveBeenCalledWith({
      baseUrl: "https://auth.example.com",
      cookies: {
        secret: "secret",
      },
    });
  });

  it("includes cookie domain when configured", async () => {
    state.env.auth.cookieDomain = "example.com";
    const auth = { getSession: vi.fn() };
    state.createNeonAuth.mockReturnValue(auth);

    const mod = await import("@/lib/auth/neon-auth.server");
    mod.getAuth();

    expect(state.createNeonAuth).toHaveBeenCalledWith({
      baseUrl: "https://auth.example.com",
      cookies: {
        domain: "example.com",
        secret: "secret",
      },
    });
  });
});
