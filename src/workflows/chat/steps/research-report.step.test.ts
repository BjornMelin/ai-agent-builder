import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { budgets } from "@/lib/config/budgets.server";
import type { AppError } from "@/lib/core/errors";
import { createResearchReportStep } from "@/workflows/chat/steps/research-report.step";
import { createChatToolContext } from "@/workflows/chat/tool-context";

const state = vi.hoisted(() => ({
  createResearchReportArtifact: vi.fn(),
}));

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
  state.createResearchReportArtifact.mockResolvedValue({
    artifactId: "artifact_1",
    kind: "RESEARCH_REPORT",
    logicalKey: "research-abc",
    title: "Research report: test",
    version: 1,
  });
});

describe("createResearchReportStep", () => {
  it("enforces the web search call budget", async () => {
    const ctx = createChatToolContext("proj_1");
    ctx.toolBudget.webSearchCalls = budgets.maxWebSearchCallsPerTurn;

    await expect(
      createResearchReportStep({ query: "test" }, makeToolOptions(ctx)),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);
  });

  it("enforces the web extract call budget", async () => {
    const ctx = createChatToolContext("proj_1");
    ctx.toolBudget.webExtractCalls = budgets.maxWebExtractCallsPerTurn;

    await expect(
      createResearchReportStep({ query: "test" }, makeToolOptions(ctx)),
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    } satisfies Partial<AppError>);
  });

  it("reserves remaining extract budget and forwards maxExtractUrls to artifact creation", async () => {
    const ctx = createChatToolContext("proj_1");
    ctx.toolBudget.webExtractCalls = budgets.maxWebExtractCallsPerTurn - 1;

    await createResearchReportStep({ query: "test" }, makeToolOptions(ctx));

    expect(state.createResearchReportArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        maxExtractUrls: 1,
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
