import { createMockLanguageModelV4Text } from "@tests/utils/ai-sdk";
import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "@/lib/core/errors";
import { createResearchReportArtifact } from "@/lib/research/research-report.server";

const state = vi.hoisted(() => ({
  createArtifactVersion: vi.fn(),
  extractWebPage: vi.fn(),
  getArtifactByIdempotencyKey: vi.fn(),
  getChatModelById: vi.fn(),
  searchWeb: vi.fn(),
}));

vi.mock("@/lib/ai/gateway.server", () => ({
  getChatModelById: state.getChatModelById,
}));

vi.mock("@/lib/ai/tools/web-search.server", () => ({
  searchWeb: state.searchWeb,
}));

vi.mock("@/lib/ai/tools/web-extract.server", () => ({
  extractWebPage: state.extractWebPage,
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  createArtifactVersion: state.createArtifactVersion,
  getArtifactByIdempotencyKey: state.getArtifactByIdempotencyKey,
}));

let model: MockLanguageModelV4;

beforeEach(() => {
  vi.clearAllMocks();

  model = createMockLanguageModelV4Text(
    "# Research report\n\nHello [[1]](citation:1)",
  );
  state.getChatModelById.mockReturnValue(model);
  state.getArtifactByIdempotencyKey.mockResolvedValue(null);

  state.searchWeb.mockResolvedValue({
    requestId: "req_1",
    results: [
      { id: "hit_1", title: "A", url: "https://example.com/a" },
      { id: "hit_2", title: "B", url: "https://example.com/b" },
    ],
  });

  state.extractWebPage.mockImplementation(async ({ url }: { url: string }) => ({
    description: null,
    markdown: `# ${url}\n\ncontent`,
    publishedTime: null,
    title: url.includes("/a") ? "A" : "B",
    url,
  }));

  state.createArtifactVersion.mockResolvedValue({
    content: { format: "markdown", markdown: "x", title: "x" },
    createdAt: new Date().toISOString(),
    id: "artifact_1",
    kind: "RESEARCH_REPORT",
    logicalKey: "research-abc",
    projectId: "proj_1",
    runId: null,
    updatedAt: new Date().toISOString(),
    version: 1,
  });
});

describe("createResearchReportArtifact", () => {
  it("rejects empty queries", async () => {
    await expect(
      createResearchReportArtifact({
        idempotencyKey: "step-empty",
        modelId: "openai/gpt-4.1",
        projectId: "proj_1",
        query: " ",
      }),
    ).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("creates a markdown artifact with normalized citations", async () => {
    const result = await createResearchReportArtifact({
      idempotencyKey: "step-report-1",
      maxExtractUrls: 2,
      modelId: "openai/gpt-4.1",
      projectId: "proj_1",
      query: "Next.js cache components",
      runId: "run_1",
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    const call = model.doGenerateCalls[0];
    const prompt = call?.prompt ?? [];

    expect(prompt.find((m) => m.role === "system")?.content).toContain(
      "Cite sources inline using the exact syntax",
    );
    expect(prompt.find((m) => m.role === "system")?.content).toContain(
      "Do not invent citations.",
    );

    const userParts = prompt.find((m) => m.role === "user")?.content ?? [];
    const userText = userParts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("");
    expect(userText).toContain("Research question:");
    expect(userText).toContain("Source 1:");
    expect(userText).toContain("https://example.com/a");

    expect(result).toEqual(
      expect.objectContaining({
        artifactId: "artifact_1",
        kind: "RESEARCH_REPORT",
        version: 1,
      }),
    );

    expect(state.searchWeb).toHaveBeenCalledWith({
      query: "Next.js cache components",
    });

    expect(state.extractWebPage).toHaveBeenCalledTimes(2);

    expect(state.createArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        citations: [
          expect.objectContaining({
            payload: expect.objectContaining({
              index: 1,
              url: "https://example.com/a",
            }),
            sourceRef: "https://example.com/a",
            sourceType: "web",
          }),
          expect.objectContaining({
            payload: expect.objectContaining({
              index: 2,
              url: "https://example.com/b",
            }),
            sourceRef: "https://example.com/b",
            sourceType: "web",
          }),
        ],
        content: expect.objectContaining({
          format: "markdown",
          query: "Next.js cache components",
          sources: [
            expect.objectContaining({
              title: "A",
              url: "https://example.com/a",
            }),
            expect.objectContaining({
              title: "B",
              url: "https://example.com/b",
            }),
          ],
        }),
        idempotencyKey: "step-report-1",
        kind: "RESEARCH_REPORT",
        logicalKey: expect.stringMatching(/^research-report:[0-9a-f]{64}$/),
        projectId: "proj_1",
        runId: "run_1",
      }),
    );
  });

  it("respects maxExtractUrls", async () => {
    await createResearchReportArtifact({
      idempotencyKey: "step-report-2",
      maxExtractUrls: 1,
      modelId: "openai/gpt-4.1",
      projectId: "proj_1",
      query: "test",
    });

    expect(state.extractWebPage).toHaveBeenCalledTimes(1);
    expect(state.extractWebPage).toHaveBeenCalledWith({
      url: "https://example.com/a",
    });
  });

  it("recovers a post-commit retry before repeating external producer work", async () => {
    state.getArtifactByIdempotencyKey.mockResolvedValueOnce({
      content: { format: "markdown", markdown: "committed" },
      createdAt: new Date(0).toISOString(),
      id: "artifact_committed",
      kind: "RESEARCH_REPORT",
      logicalKey:
        "research-report:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      projectId: "proj_1",
      runId: null,
      version: 3,
    });

    const result = await createResearchReportArtifact({
      idempotencyKey: "step-replayed-after-commit",
      modelId: "openai/gpt-4.1",
      projectId: "proj_1",
      query: "test",
    });

    expect(result).toMatchObject({
      artifactId: "artifact_committed",
      version: 3,
    });
    expect(state.searchWeb).not.toHaveBeenCalled();
    expect(state.extractWebPage).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(state.createArtifactVersion).not.toHaveBeenCalled();
  });
});
