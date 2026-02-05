import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/db/client";
import { createArtifactVersionTx } from "@/lib/data/artifacts.server";

vi.mock("@/lib/data/citations.server", () => ({
  insertArtifactCitationsTx: vi.fn().mockResolvedValue(undefined),
}));

function createFakeTx(options?: Readonly<{ maxVersion?: number }>) {
  const maxVersion = options?.maxVersion ?? 0;

  const whereSelect = vi.fn().mockResolvedValue([{ maxVersion }]);
  const from = vi.fn().mockReturnValue({ where: whereSelect });
  const select = vi.fn().mockReturnValue({ from });

  const returning = vi.fn();
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  const tx = { insert, select } as unknown as DbClient;

  return { from, insert, returning, select, tx, values, whereSelect };
}

describe("createArtifactVersionTx", () => {
  it("creates version 1 when no prior versions exist", async () => {
    const { tx, returning, values } = createFakeTx({ maxVersion: 0 });
    returning.mockResolvedValueOnce([
      {
        content: { format: "markdown", markdown: "x", title: "t" },
        createdAt: new Date(0),
        id: "art_1",
        kind: "PRD",
        logicalKey: "PRD",
        projectId: "proj_1",
        runId: null,
        version: 1,
      },
    ]);

    const res = await createArtifactVersionTx(tx, {
      content: { format: "markdown", markdown: "x", title: "t" },
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1 }),
    );
    expect(res.version).toBe(1);
  });

  it("retries on unique constraint violation", async () => {
    const { tx, returning, values, whereSelect } = createFakeTx();
    whereSelect
      .mockResolvedValueOnce([{ maxVersion: 1 }])
      .mockResolvedValueOnce([{ maxVersion: 2 }]);

    returning.mockRejectedValueOnce({ code: "23505" }).mockResolvedValueOnce([
      {
        content: { format: "markdown", markdown: "x", title: "t" },
        createdAt: new Date(0),
        id: "art_2",
        kind: "PRD",
        logicalKey: "PRD",
        projectId: "proj_1",
        runId: null,
        version: 3,
      },
    ]);

    const res = await createArtifactVersionTx(tx, {
      content: { format: "markdown", markdown: "x", title: "t" },
      kind: "PRD",
      logicalKey: "PRD",
      projectId: "proj_1",
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ version: 3 }),
    );
    expect(res.version).toBe(3);
  });
});
