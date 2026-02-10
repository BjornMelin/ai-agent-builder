import { installImplementationRunHarness } from "@tests/utils/implementation-run-harness";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = installImplementationRunHarness();
const { state } = harness;

beforeEach(() => {
  vi.clearAllMocks();
  harness.reset();
});

describe("preflightImplementationRun", () => {
  it("throws env_invalid when GITHUB_TOKEN is missing", async () => {
    state.env.github.token = "";
    const { preflightImplementationRun } = await import("./preflight.step");
    await expect(preflightImplementationRun()).rejects.toMatchObject({
      code: "env_invalid",
      status: 500,
    });
  });

  it("returns non-secret preflight metadata", async () => {
    const { preflightImplementationRun } = await import("./preflight.step");
    await expect(preflightImplementationRun()).resolves.toMatchObject({
      aiGatewayBaseUrl: "https://ai-gateway.example.com",
      aiGatewayChatModel: "openai/gpt-4o",
      githubConfigured: true,
      ok: true,
      sandboxAuth: "oidc",
    });
  });
});
