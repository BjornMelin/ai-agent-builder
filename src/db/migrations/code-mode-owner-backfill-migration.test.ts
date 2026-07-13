import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "./0011_backfill-code-mode-owner.sql",
  import.meta.url,
);

describe("Code Mode owner backfill migration", () => {
  it("assigns legacy runs to their canonical project owner", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain("jsonb_set");
    expect(migration).toContain("'{startedByUserId}'");
    expect(migration).toContain('"projects"."owner_user_id"');
    expect(migration).toContain(`"metadata"->>'origin' = 'code-mode'`);
    expect(migration).toContain(`NOT ("runs"."metadata" ? 'startedByUserId')`);
  });
});
