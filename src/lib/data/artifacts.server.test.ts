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

  it("returns the single idempotency-key winner after a concurrent insert", async () => {
    const existing = {
      content: { format: "markdown", markdown: "winner", title: "report" },
      createdAt: new Date(0),
      id: "art_winner",
      idempotencyKey: "workflow-step-1",
      kind: "RESEARCH_REPORT",
      logicalKey: "research-report:query",
      projectId: "proj_1",
      runId: null,
      version: 2,
    };
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existing);
    const whereSelect = vi.fn().mockResolvedValue([{ maxVersion: 1 }]);
    const returning = vi.fn().mockResolvedValue([]);
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      }),
      query: { artifactsTable: { findFirst } },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: whereSelect }),
      }),
    } as unknown as DbClient;
    state.transaction.mockImplementationOnce(
      async (callback: (client: DbClient) => Promise<unknown>) =>
        await callback(tx),
    );
    const { createArtifactVersion } = await import(
      "@/lib/data/artifacts.server"
    );

    await expect(
      createArtifactVersion({
        citations: [{ sourceRef: "https://example.com", sourceType: "web" }],
        content: existing.content,
        idempotencyKey: existing.idempotencyKey,
        kind: existing.kind,
        logicalKey: existing.logicalKey,
        projectId: existing.projectId,
      }),
    ).resolves.toMatchObject({ id: "art_winner", version: 2 });

    expect(returning).toHaveBeenCalledTimes(1);
    expect(state.insertArtifactCitationsTx).not.toHaveBeenCalled();
  });

  it("commits citations atomically with the first idempotent artifact winner", async () => {
    const created = {
      content: { format: "markdown", markdown: "winner", title: "report" },
      createdAt: new Date(0),
      id: "art_created",
      idempotencyKey: "workflow-step-2",
      kind: "RESEARCH_REPORT",
      logicalKey: "research-report:query",
      projectId: "proj_1",
      runId: null,
      version: 1,
    };
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([created]),
          }),
        }),
      }),
      query: {
        artifactsTable: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ maxVersion: 0 }]),
        }),
      }),
    } as unknown as DbClient;
    state.transaction.mockImplementationOnce(
      async (callback: (client: DbClient) => Promise<unknown>) =>
        await callback(tx),
    );
    const { createArtifactVersion } = await import(
      "@/lib/data/artifacts.server"
    );
    const citations = [{ sourceRef: "https://example.com", sourceType: "web" }];

    await expect(
      createArtifactVersion({
        citations,
        content: created.content,
        idempotencyKey: created.idempotencyKey,
        kind: created.kind,
        logicalKey: created.logicalKey,
        projectId: created.projectId,
      }),
    ).resolves.toMatchObject({ id: "art_created", version: 1 });

    expect(state.insertArtifactCitationsTx).toHaveBeenCalledWith(tx, {
      artifactId: "art_created",
      citations,
      projectId: "proj_1",
    });
  });
});

describe("createArtifactVersionOnce", () => {
  it("returns the existing version-one row after a concurrent insert wins", async () => {
    const existing = {
      content: { format: "markdown", markdown: "first", title: "summary" },
      createdAt: new Date(0),
      id: "art_existing",
      kind: "CODE_MODE_SUMMARY",
      logicalKey: "code-mode:run_1",
      projectId: "proj_1",
      runId: "run_1",
      version: 1,
    };
    const returning = vi.fn().mockResolvedValue([]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = {
      insert: vi.fn().mockReturnValue({ values }),
      query: {
        artifactsTable: {
          findFirst: vi.fn().mockResolvedValue(existing),
        },
      },
    } as unknown as DbClient;
    state.transaction.mockImplementationOnce(
      async (callback: (client: DbClient) => Promise<unknown>) =>
        await callback(tx),
    );
    const { createArtifactVersionOnce } = await import(
      "@/lib/data/artifacts.server"
    );

    await expect(
      createArtifactVersionOnce({
        content: existing.content,
        kind: existing.kind,
        logicalKey: existing.logicalKey,
        projectId: existing.projectId,
        runId: existing.runId,
      }),
    ).resolves.toMatchObject({ id: "art_existing", version: 1 });

    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(state.revalidateTag).toHaveBeenCalledWith(
      "aab:artifacts:index:proj_1",
      "max",
    );
  });
});
