import { makeToolOptions } from "@tests/utils/tool-execution-options";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";
import { createResearchReportStep } from "@/workflows/chat/steps/research-report.step";

const state = vi.hoisted(() => ({ createResearchReportArtifact: vi.fn() }));
let previousAiGatewayApiKey: string | undefined;

vi.mock("@/lib/research/research-report.server", () => ({
  createResearchReportArtifact: state.createResearchReportArtifact,
}));

vi.mock("workflow", () => ({
  getStepMetadata: () => ({ stepId: "workflow-step-research-1" }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  previousAiGatewayApiKey = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY ??= "test-key";
  state.createResearchReportArtifact.mockResolvedValue({
    artifactId: "artifact_1",
    kind: "RESEARCH_REPORT",
    logicalKey: "research-abc",
    title: "Research report: test",
    version: 1,
  });
});

afterEach(() => {
  if (previousAiGatewayApiKey === undefined) {
    delete process.env.AI_GATEWAY_API_KEY;
  } else {
    process.env.AI_GATEWAY_API_KEY = previousAiGatewayApiKey;
  }
});

describe("createResearchReportStep", () => {
  it("requires immutable project and mode context", async () => {
    await expect(
      createResearchReportStep(
        { query: "test" },
        makeToolOptions({ ctx: { modeId: "", projectId: "proj_1" } }),
      ),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("forwards the configured compound research allowance", async () => {
    const controller = new AbortController();
    await createResearchReportStep(
      { query: "test" },
      makeToolOptions({
        ctx: { modeId: "researcher", projectId: "proj_1" },
        signal: controller.signal,
      }),
    );

    expect(state.createResearchReportArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: controller.signal,
        idempotencyKey: "workflow-step-research-1",
        maxExtractUrls: Math.min(3, budgets.maxWebExtractCallsPerTurn),
        modelId: expect.any(String),
        projectId: "proj_1",
        query: "test",
      }),
    );
  });
});
