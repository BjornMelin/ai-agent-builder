import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunStepExecutionResult } from "@/lib/runs/run-engine.server";

const state = vi.hoisted(() => ({
  env: {
    app: { baseUrl: "https://app.example.com" },
  },
  executeRunStep: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  verifyQstashSignatureAppRouter: (
    handler: (req: Request) => Promise<Response> | Response,
  ) => handler,
}));

vi.mock("@/lib/runs/run-engine.server", () => ({
  executeRunStep: state.executeRunStep,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/jobs/run-step/route");
  return mod.POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.env.app.baseUrl = "https://app.example.com";
  state.executeRunStep.mockResolvedValue({
    runId: "run_123",
    status: "succeeded",
    stepId: "run.start",
  } satisfies RunStepExecutionResult);
});

describe("POST /api/jobs/run-step", () => {
  it("rejects invalid JSON bodies", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/jobs/run-step", {
        body: "{",
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("rejects invalid payloads", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/jobs/run-step", {
        body: JSON.stringify({ runId: "run_123" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("executes a run step using the configured origin", async () => {
    const POST = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/jobs/run-step", {
        body: JSON.stringify({ runId: "run_123", stepId: "run.start" }),
        method: "POST",
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      runId: "run_123",
      status: "succeeded",
      stepId: "run.start",
    });
    expect(state.executeRunStep).toHaveBeenCalledWith({
      origin: "https://app.example.com",
      runId: "run_123",
      stepId: "run.start",
    });
  });
});
