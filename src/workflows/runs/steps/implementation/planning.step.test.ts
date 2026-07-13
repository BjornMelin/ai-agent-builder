import { createMockLanguageModelV4Text } from "@tests/utils/ai-sdk";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PlanInput = Readonly<{
  projectId: string;
  projectName: string;
  projectSlug: string;
  repoOwner: string;
  repoName: string;
  runId: string;
}>;

function makePlanInput(): PlanInput {
  return {
    projectId: "proj_1",
    projectName: "Project",
    projectSlug: "project",
    repoName: "repo",
    repoOwner: "owner",
    runId: "run_1",
  };
}

type EnvShape = Readonly<{
  aiGateway: Readonly<{ apiKey: string; baseUrl: string; chatModel: string }>;
  context7?: unknown;
}>;

function makeEnv(overrides?: Partial<EnvShape>): EnvShape {
  return {
    aiGateway: {
      apiKey: "key",
      baseUrl: "https://ai-gateway.example.com",
      chatModel: "openai/gpt-4o",
    },
    ...(overrides ?? {}),
  };
}

type LanguageModelV4GenerateResult = Awaited<
  ReturnType<MockLanguageModelV4["doGenerate"]>
>;

function makeToolCallGenerateResult(
  input: Readonly<{
    toolCallId: string;
    toolName: string;
    toolInput: unknown;
  }>,
): LanguageModelV4GenerateResult {
  return {
    content: [
      {
        input: JSON.stringify(input.toolInput),
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        type: "tool-call",
      },
    ],
    finishReason: { raw: undefined, unified: "tool-calls" },
    usage: {
      inputTokens: {
        cacheRead: undefined,
        cacheWrite: undefined,
        noCache: 3,
        total: 3,
      },
      outputTokens: {
        reasoning: undefined,
        text: 10,
        total: 10,
      },
    },
    warnings: [],
  } satisfies LanguageModelV4GenerateResult;
}

function makeTextGenerateResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ text, type: "text" }],
    finishReason: { raw: undefined, unified: "stop" },
    usage: {
      inputTokens: {
        cacheRead: undefined,
        cacheWrite: undefined,
        noCache: 3,
        total: 3,
      },
      outputTokens: {
        reasoning: undefined,
        text: 10,
        total: 10,
      },
    },
    warnings: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
});

describe("planImplementationRun (Context7 conditional loading)", () => {
  it("passes immutable project context to skills without importing Context7", async () => {
    const plan = {
      commitMessage: "feat: plan",
      planMarkdown: "## Plan",
      prBody: "body",
      prTitle: "title",
    };

    const model = new MockLanguageModelV4({
      doGenerate: [
        makeToolCallGenerateResult({
          toolCallId: "call_1",
          toolInput: { name: "clean-code" },
          toolName: "skills.load",
        }),
        makeTextGenerateResult(JSON.stringify(plan)),
      ],
    });
    const loadSkillForProject = vi.fn(async () => ({
      content: "instructions",
      name: "clean-code",
      ok: true,
      skillDirectory: "skills/clean-code",
      source: "fs",
    }));

    vi.doMock("@/lib/env", () => ({
      env: makeEnv(),
    }));

    vi.doMock("@/lib/config/budgets.server", () => ({
      budgets: { maxContext7CallsPerTurn: 1 },
    }));

    vi.doMock("@/lib/ai/skills/index.server", () => ({
      listAvailableSkillsForProject: async () => [],
      loadSkillForProject,
      readSkillFileForProject: async () => ({
        error: "unavailable",
        ok: false,
      }),
    }));

    vi.doMock("@/lib/ai/tools/mcp-context7.server", () => {
      throw new Error("Context7 module should not be imported in this test.");
    });

    vi.doMock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return {
        ...mod,
        createGateway: () => ({
          languageModel: () => model,
        }),
      };
    });

    const { planImplementationRun } = await import("./planning.step");
    await expect(planImplementationRun(makePlanInput())).resolves.toEqual(plan);
    expect(loadSkillForProject).toHaveBeenCalledWith({
      name: "clean-code",
      projectId: "proj_1",
    });
  });

  it("imports the Context7 module when env.context7 is configured", async () => {
    const plan = {
      commitMessage: "feat: plan",
      planMarkdown: "## Plan",
      prBody: "body",
      prTitle: "title",
    };

    const model: MockLanguageModelV4 = createMockLanguageModelV4Text(
      JSON.stringify(plan),
    );

    const state = { context7Imported: false };

    vi.doMock("@/lib/env", () => ({
      env: makeEnv({ context7: { apiKey: "c7" } }),
    }));

    vi.doMock("@/lib/config/budgets.server", () => ({
      budgets: { maxContext7CallsPerTurn: 1 },
    }));

    vi.doMock("@/lib/ai/skills/index.server", () => ({
      listAvailableSkillsForProject: async () => [],
      loadSkillForProject: async () => ({ error: "unavailable", ok: false }),
      readSkillFileForProject: async () => ({
        error: "unavailable",
        ok: false,
      }),
    }));

    vi.doMock("@/lib/ai/tools/mcp-context7.server", () => {
      state.context7Imported = true;
      return {
        context7QueryDocs: async () => ({ ok: true }),
        context7ResolveLibraryId: async () => ({ ok: true }),
      };
    });

    vi.doMock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return {
        ...mod,
        createGateway: () => ({
          languageModel: () => model,
        }),
      };
    });

    const { planImplementationRun } = await import("./planning.step");
    await expect(planImplementationRun(makePlanInput())).resolves.toEqual(plan);
    expect(state.context7Imported).toBe(true);
  });

  it("executes a Context7 tool call and still returns a plan", async () => {
    vi.doMock("@/lib/env", () => ({
      env: makeEnv({ context7: { apiKey: "c7" } }),
    }));

    vi.doMock("@/lib/config/budgets.server", () => ({
      budgets: { maxContext7CallsPerTurn: 2 },
    }));

    vi.doMock("@/lib/ai/skills/index.server", () => ({
      listAvailableSkillsForProject: async () => [],
      loadSkillForProject: async () => ({ error: "unavailable", ok: false }),
      readSkillFileForProject: async () => ({
        error: "unavailable",
        ok: false,
      }),
    }));

    vi.doMock("@/lib/ai/tools/mcp-context7.server", () => ({
      context7QueryDocs: async () => ({ ok: true }),
      context7ResolveLibraryId: async () => ({ ok: true }),
    }));

    const plan = {
      commitMessage: "feat: plan",
      planMarkdown: "## Plan",
      prBody: "body",
      prTitle: "title",
    };
    const generateResults: LanguageModelV4GenerateResult[] = [
      makeToolCallGenerateResult({
        toolCallId: "call_1",
        toolInput: { libraryName: "react", query: "hooks" },
        toolName: "context7.resolve-library-id",
      }),
      {
        content: [{ text: JSON.stringify(plan), type: "text" }],
        finishReason: { raw: undefined, unified: "stop" },
        usage: {
          inputTokens: {
            cacheRead: undefined,
            cacheWrite: undefined,
            noCache: 3,
            total: 3,
          },
          outputTokens: {
            reasoning: undefined,
            text: 10,
            total: 10,
          },
        },
        warnings: [],
      } satisfies LanguageModelV4GenerateResult,
    ];
    let generateIndex = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const res = generateResults[generateIndex];
        generateIndex += 1;
        if (!res) {
          return makeToolCallGenerateResult({
            toolCallId: "call_unexpected",
            toolInput: {},
            toolName: "skills.load",
          });
        }
        return res;
      },
    });

    vi.doMock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return {
        ...mod,
        createGateway: () => ({
          languageModel: () => model,
        }),
      };
    });

    const { planImplementationRun } = await import("./planning.step");
    await expect(planImplementationRun(makePlanInput())).resolves.toEqual(plan);
  });

  it("does not call Context7 tools when maxContext7CallsPerTurn is 0", async () => {
    vi.doMock("@/lib/env", () => ({
      env: makeEnv({ context7: { apiKey: "c7" } }),
    }));

    vi.doMock("@/lib/config/budgets.server", () => ({
      budgets: { maxContext7CallsPerTurn: 0 },
    }));

    vi.doMock("@/lib/ai/skills/index.server", () => ({
      listAvailableSkillsForProject: async () => [],
      loadSkillForProject: async () => ({ error: "unavailable", ok: false }),
      readSkillFileForProject: async () => ({
        error: "unavailable",
        ok: false,
      }),
    }));

    const context7Spies = {
      query: vi.fn(async () => ({ ok: true })),
      resolve: vi.fn(async () => ({ ok: true })),
    };

    vi.doMock("@/lib/ai/tools/mcp-context7.server", () => ({
      context7QueryDocs: context7Spies.query,
      context7ResolveLibraryId: context7Spies.resolve,
    }));

    const plan = {
      commitMessage: "feat: plan",
      planMarkdown: "## Plan",
      prBody: "body",
      prTitle: "title",
    };
    const generateResults: LanguageModelV4GenerateResult[] = [
      makeToolCallGenerateResult({
        toolCallId: "call_1",
        toolInput: { libraryName: "react", query: "hooks" },
        toolName: "context7.resolve-library-id",
      }),
      {
        content: [{ text: JSON.stringify(plan), type: "text" }],
        finishReason: { raw: undefined, unified: "stop" },
        usage: {
          inputTokens: {
            cacheRead: undefined,
            cacheWrite: undefined,
            noCache: 3,
            total: 3,
          },
          outputTokens: {
            reasoning: undefined,
            text: 10,
            total: 10,
          },
        },
        warnings: [],
      } satisfies LanguageModelV4GenerateResult,
    ];
    let generateIndex = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const res = generateResults[generateIndex];
        generateIndex += 1;
        if (!res) {
          return {
            content: [{ text: JSON.stringify(plan), type: "text" }],
            finishReason: { raw: undefined, unified: "stop" },
            usage: {
              inputTokens: {
                cacheRead: undefined,
                cacheWrite: undefined,
                noCache: 3,
                total: 3,
              },
              outputTokens: {
                reasoning: undefined,
                text: 10,
                total: 10,
              },
            },
            warnings: [],
          } satisfies LanguageModelV4GenerateResult;
        }
        return res;
      },
    });

    vi.doMock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return {
        ...mod,
        createGateway: () => ({
          languageModel: () => model,
        }),
      };
    });

    const { planImplementationRun } = await import("./planning.step");
    await expect(planImplementationRun(makePlanInput())).resolves.toEqual(plan);
    expect(context7Spies.resolve).not.toHaveBeenCalled();
  });
});
