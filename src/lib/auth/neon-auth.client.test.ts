import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createAuthClient: vi.fn(),
}));

vi.mock("@neondatabase/auth/next", () => ({
  createAuthClient: state.createAuthClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("neon auth client", () => {
  it("creates a singleton auth client at module load", async () => {
    const client = { kind: "auth-client" };
    state.createAuthClient.mockReturnValue(client);

    const mod = await import("@/lib/auth/neon-auth.client");

    expect(mod.authClient).toBe(client);
    expect(state.createAuthClient).toHaveBeenCalledTimes(1);
  });
});
