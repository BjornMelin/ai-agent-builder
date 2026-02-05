import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/core/sha256";
import { buildDeterministicZipBytes } from "@/lib/export/deterministic-zip.server";

describe("buildDeterministicZipBytes", () => {
  it("produces identical ZIP bytes for identical inputs (ordering-independent)", async () => {
    const project = { id: "proj_1", name: "Project", slug: "project" } as const;

    const filesA = [
      {
        contentBytes: new TextEncoder().encode("alpha\n"),
        path: "artifacts/PRD/PRD.v1.md",
      },
      {
        contentBytes: new TextEncoder().encode("beta\n"),
        path: "citations/PRD/PRD.v1.json",
      },
    ] as const;

    const filesB = [...filesA].reverse();

    const a = await buildDeterministicZipBytes({ files: filesA, project });
    const b = await buildDeterministicZipBytes({ files: filesB, project });

    expect(sha256Hex(a.bytes)).toBe(sha256Hex(b.bytes));
  });
});
