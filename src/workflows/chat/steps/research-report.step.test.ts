import type { ToolExecutionOptions } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";
import { createResearchReportStep } from "@/workflows/chat/steps/research-report.step";
import { createChatToolContext } from "@/workflows/chat/tool-context";

const state = vi.hoisted(() => ({
  createResearchReportArtifact: vi.fn(),
}));

let previousAiGatewayApiKey: string | undefined;

vi.mock("@/lib/research/research-report.server", () => ({
  createResearchReportArtifact: state.createResearchReportArtifact,
}));

function makeToolOptions(experimental_context: unknown): ToolExecutionOptions {
  return {
    experimental_context,
    messages: [],
    toolCallId: "tool-call-1",
  };
}

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
  it("enforces the web search call budget", async () => {
    const ctx = createChatToolContext("proj_1", "researcher");
    ctx.toolBudget.webSearchCalls = budgets.maxWebSearchCallsPerTurn;

    await expect(
      createResearchReportStep({ query: "test" }, makeToolOptions(ctx)),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);
  });

  it("enforces the web extract call budget", async () => {
    const ctx = createChatToolContext("proj_1", "researcher");
    ctx.toolBudget.webExtractCalls = budgets.maxWebExtractCallsPerTurn;

    await expect(
      createResearchReportStep({ query: "test" }, makeToolOptions(ctx)),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);
  });

  it("reserves remaining extract budget and forwards maxExtractUrls to artifact creation", async () => {
    const ctx = createChatToolContext("proj_1", "researcher");
    ctx.toolBudget.webExtractCalls = budgets.maxWebExtractCallsPerTurn - 1;

    await createResearchReportStep({ query: "test" }, makeToolOptions(ctx));

    expect(state.createResearchReportArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        maxExtractUrls: 1,
        modelId: expect.any(String),
        projectId: "proj_1",
        query: "test",
      }),
    );
    expect(ctx.toolBudget.webSearchCalls).toBe(1);
    expect(ctx.toolBudget.webExtractCalls).toBe(
      budgets.maxWebExtractCallsPerTurn,
    );
  });
});
