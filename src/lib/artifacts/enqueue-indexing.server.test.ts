import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  env: {
    app: { baseUrl: "https://app.example.com" },
    runtime: { isVercel: false },
  },
  getQstashClient: vi.fn(),
  indexArtifactVersion: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: state.env,
}));

vi.mock("@/lib/upstash/qstash.server", () => ({
  getQstashClient: () => state.getQstashClient(),
}));

vi.mock("@/lib/artifacts/index-artifact.server", () => ({
  indexArtifactVersion: state.indexArtifactVersion,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.env.runtime.isVercel = false;
});

describe("enqueueArtifactIndexing", () => {
  it("publishes a QStash job when QStash is configured", async () => {
    const publishJSON = vi.fn().mockResolvedValue(undefined);
    state.getQstashClient.mockReturnValue({ publishJSON });

    const { enqueueArtifactIndexing } = await import(
      "@/lib/artifacts/enqueue-indexing.server"
    );

    await enqueueArtifactIndexing({
      artifactId: "art_1",
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
      version: 2,
    });

    expect(publishJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ artifactId: "art_1" }),
        label: "index-artifact",
        url: "https://app.example.com/api/jobs/index-artifact",
      }),
    );
    expect(state.indexArtifactVersion).not.toHaveBeenCalled();
  });

  it("falls back to inline indexing locally when QStash publish fails", async () => {
    state.getQstashClient.mockReturnValue({
      publishJSON: vi.fn().mockRejectedValue(new Error("qstash down")),
    });
    state.indexArtifactVersion.mockRejectedValue(new Error("inline failed"));

    const { enqueueArtifactIndexing } = await import(
      "@/lib/artifacts/enqueue-indexing.server"
    );

    await expect(
      enqueueArtifactIndexing({
        artifactId: "art_1",
        kind: "PRD",
        logicalKey: "PRD",
        projectId: "proj_1",
        version: 2,
      }),
    ).resolves.toBeUndefined();

    expect(state.indexArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({ artifactId: "art_1" }),
    );
  });

  it("rethrows publish errors on Vercel runtime", async () => {
    state.env.runtime.isVercel = true;
    state.getQstashClient.mockReturnValue({
      publishJSON: vi.fn().mockRejectedValue(new Error("qstash down")),
    });

    const { enqueueArtifactIndexing } = await import(
      "@/lib/artifacts/enqueue-indexing.server"
    );

    await expect(
      enqueueArtifactIndexing({
        artifactId: "art_1",
        kind: "PRD",
        logicalKey: "PRD",
        projectId: "proj_1",
        version: 2,
      }),
    ).rejects.toMatchObject({
      message: "qstash down",
    } satisfies Partial<AppError>);
  });
});
