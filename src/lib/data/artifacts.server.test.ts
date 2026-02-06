import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";

const state = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  insertArtifactCitationsTx: vi.fn(),
  revalidateTag: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheLife: state.cacheLife,
  cacheTag: state.cacheTag,
  revalidateTag: state.revalidateTag,
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({
    transaction: state.transaction,
  }),
}));

vi.mock("@/lib/data/citations.server", () => ({
  insertArtifactCitationsTx: state.insertArtifactCitationsTx,
}));

function createFakeTx(options?: Readonly<{ maxVersion?: number }>) {
  const maxVersion = options?.maxVersion ?? 0;

  const whereSelect = vi.fn().mockResolvedValue([{ maxVersion }]);
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn().mockResolvedValue([
    {
      content: { format: "markdown", markdown: "x", title: "t" },
      createdAt: new Date(0),
      id: "art_1",
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
      runId: null,
      version: maxVersion + 1,
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const tx = { insert, select } as unknown as DbClient;
  return { tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.insertArtifactCitationsTx.mockResolvedValue(undefined);
});

describe("createArtifactVersion", () => {
  it("revalidates project artifact cache tag after creation", async () => {
    const { tx } = createFakeTx({ maxVersion: 0 });
    state.transaction.mockImplementationOnce(
      async (callback: (client: DbClient) => Promise<unknown>) =>
        await callback(tx),
    );

    const { createArtifactVersion } = await import(
      "@/lib/data/artifacts.server"
    );

    const result = await createArtifactVersion({
      content: { format: "markdown", markdown: "x", title: "t" },
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
    });

    expect(result.id).toBe("art_1");
    expect(state.revalidateTag).toHaveBeenCalledWith(
      "aab:artifacts:index:proj_1",
      "max",
    );
  });
});
