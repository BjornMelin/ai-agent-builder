import { beforeEach, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@/lib/core/sha256";

type ArtifactRecord = Readonly<{
  content: Record<string, unknown>;
  id: string;
  kind: string;
  logicalKey: string;
  projectId: string;
  version: number;
}>;

type ArtifactVectorRow = Readonly<{
  id: string;
  metadata: Readonly<{
    artifactVersion: number;
  }>;
}>;

const state = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  getArtifactById: vi.fn(),
  vectorDelete: vi.fn(),
  vectorNamespace: vi.fn(),
  vectorUpsert: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings.server", () => ({
  embedTexts: state.embedTexts,
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  getArtifactById: state.getArtifactById,
}));

vi.mock("@/lib/upstash/vector.server", () => ({
  getVectorIndex: () => ({ namespace: state.vectorNamespace }),
  projectArtifactsNamespace: (projectId: string) =>
    `project:${projectId}:artifacts`,
}));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/artifacts/index-artifact.server");
}

function paragraph(seed: string): string {
  return `${seed} ${"x".repeat(2_000)}`;
}

function createArtifact(
  input: Readonly<{
    id: string;
    logicalKey: string;
    markdownParagraphs: readonly string[];
    projectId: string;
    version: number;
  }>,
): ArtifactRecord {
  return {
    content: {
      format: "markdown",
      markdown: input.markdownParagraphs.join("\n\n"),
      title: "Design Doc",
    },
    id: input.id,
    kind: "PRD",
    logicalKey: input.logicalKey,
    projectId: input.projectId,
    version: input.version,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  state.vectorDelete.mockResolvedValue({ deleted: 0 });
  state.vectorUpsert.mockResolvedValue("OK");
  state.vectorNamespace.mockReturnValue({
    delete: state.vectorDelete,
    upsert: state.vectorUpsert,
  });

  state.embedTexts.mockImplementation(async (inputs: readonly string[]) =>
    inputs.map((_, index) => [index + 0.01]),
  );
});

describe("indexArtifactVersion", () => {
  it("deletes previous chunk IDs before upserting when a new version has fewer chunks", async () => {
    const { indexArtifactVersion } = await loadModule();

    const projectId = "proj_1";
    const logicalKey = "PRD";

    const v1 = createArtifact({
      id: "art_v1",
      logicalKey,
      markdownParagraphs: [
        paragraph("one"),
        paragraph("two"),
        paragraph("three"),
      ],
      projectId,
      version: 1,
    });

    const v2 = createArtifact({
      id: "art_v2",
      logicalKey,
      markdownParagraphs: [paragraph("one"), paragraph("two")],
      projectId,
      version: 2,
    });

    state.getArtifactById.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

    await indexArtifactVersion({
      artifactId: v1.id,
      kind: v1.kind,
      logicalKey: v1.logicalKey,
      projectId,
      version: v1.version,
    });

    await indexArtifactVersion({
      artifactId: v2.id,
      kind: v2.kind,
      logicalKey: v2.logicalKey,
      projectId,
      version: v2.version,
    });

    const expectedPrefix = `${sha256Hex(`${projectId}:${v1.kind}:${logicalKey}`)}:`;

    expect(state.vectorDelete).toHaveBeenCalledTimes(2);
    expect(state.vectorDelete).toHaveBeenNthCalledWith(1, {
      prefix: expectedPrefix,
    });
    expect(state.vectorDelete).toHaveBeenNthCalledWith(2, {
      prefix: expectedPrefix,
    });

    expect(state.vectorUpsert).toHaveBeenCalledTimes(2);

    const firstUpsert = state.vectorUpsert.mock.calls[0]?.[0] as
      | readonly ArtifactVectorRow[]
      | undefined;
    const secondUpsert = state.vectorUpsert.mock.calls[1]?.[0] as
      | readonly ArtifactVectorRow[]
      | undefined;

    expect(firstUpsert).toBeDefined();
    expect(secondUpsert).toBeDefined();
    expect((firstUpsert ?? []).length).toBeGreaterThan(
      (secondUpsert ?? []).length,
    );

    expect(
      (secondUpsert ?? []).every((row) => row.id.startsWith(expectedPrefix)),
    ).toBe(true);
    expect(
      (secondUpsert ?? []).every((row) => row.metadata.artifactVersion === 2),
    ).toBe(true);

    const deleteOrder = state.vectorDelete.mock.invocationCallOrder;
    const upsertOrder = state.vectorUpsert.mock.invocationCallOrder;
    const firstDeleteOrder = deleteOrder[0];
    const firstUpsertOrder = upsertOrder[0];
    const secondDeleteOrder = deleteOrder[1];
    const secondUpsertOrder = upsertOrder[1];

    expect(firstDeleteOrder).toBeDefined();
    expect(firstUpsertOrder).toBeDefined();
    expect(secondDeleteOrder).toBeDefined();
    expect(secondUpsertOrder).toBeDefined();

    expect(firstDeleteOrder ?? 0).toBeLessThan(firstUpsertOrder ?? 0);
    expect(secondDeleteOrder ?? 0).toBeLessThan(secondUpsertOrder ?? 0);
  });
});
