import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {
    sandbox: {
      auth: "oidc" as "oidc" | "token",
      projectId: "proj",
      teamId: "team",
      token: "token",
    },
  },
  sandboxCreate: vi.fn(),
  sandboxGet: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: (...args: unknown[]) => state.sandboxCreate(...args),
    get: (...args: unknown[]) => state.sandboxGet(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.env.sandbox.auth = "oidc";
  state.env.sandbox.projectId = "proj";
  state.env.sandbox.teamId = "team";
  state.env.sandbox.token = "token";

  state.sandboxCreate.mockResolvedValue({ sandboxId: "sb_1" });
  state.sandboxGet.mockResolvedValue({ sandboxId: "sb_1" });
});

describe("createVercelSandbox", () => {
  it("uses OIDC auth when configured", async () => {
    const { createVercelSandbox } = await import(
      "@/lib/sandbox/sandbox-client.server"
    );

    await expect(
      createVercelSandbox({ timeoutMs: 1_000 }),
    ).resolves.toMatchObject({ sandboxId: "sb_1" });

    expect(state.sandboxCreate).toHaveBeenCalledTimes(1);
    const arg = state.sandboxCreate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ runtime: "node24", timeout: 1_000 });
    // OIDC should not pass teamId/token/projectId overrides.
    expect(arg).not.toMatchObject({ teamId: expect.anything() });
    expect(arg).not.toMatchObject({ token: expect.anything() });
  });

  it("requires teamId for access-token auth", async () => {
    state.env.sandbox.auth = "token";
    state.env.sandbox.teamId = "";

    const { createVercelSandbox } = await import(
      "@/lib/sandbox/sandbox-client.server"
    );

    await expect(
      createVercelSandbox({ timeoutMs: 1_000 }),
    ).rejects.toMatchObject({ code: "env_invalid", status: 500 });
  });

  it("passes teamId/token/projectId when using access-token auth", async () => {
    state.env.sandbox.auth = "token";
    state.env.sandbox.teamId = "team_1";
    state.env.sandbox.projectId = "proj_1";
    state.env.sandbox.token = "tok_1";

    const { createVercelSandbox } = await import(
      "@/lib/sandbox/sandbox-client.server"
    );

    await expect(
      createVercelSandbox({ timeoutMs: 1_000 }),
    ).resolves.toMatchObject({ sandboxId: "sb_1" });

    expect(state.sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj_1",
        teamId: "team_1",
        token: "tok_1",
      }),
    );
  });
});

describe("getVercelSandbox", () => {
  it("uses OIDC auth when configured", async () => {
    const { getVercelSandbox } = await import(
      "@/lib/sandbox/sandbox-client.server"
    );

    await expect(getVercelSandbox("sb_1")).resolves.toMatchObject({
      sandboxId: "sb_1",
    });

    expect(state.sandboxGet).toHaveBeenCalledWith({ sandboxId: "sb_1" });
  });

  it("passes teamId/token/projectId when using access-token auth", async () => {
    state.env.sandbox.auth = "token";
    state.env.sandbox.teamId = "team_1";
    state.env.sandbox.projectId = "proj_1";
    state.env.sandbox.token = "tok_1";

    const { getVercelSandbox } = await import(
      "@/lib/sandbox/sandbox-client.server"
    );

    await expect(getVercelSandbox("sb_1")).resolves.toMatchObject({
      sandboxId: "sb_1",
    });

    expect(state.sandboxGet).toHaveBeenCalledWith({
      projectId: "proj_1",
      sandboxId: "sb_1",
      teamId: "team_1",
      token: "tok_1",
    });
  });
});
