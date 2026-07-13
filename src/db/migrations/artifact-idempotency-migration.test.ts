import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "./0010_flashy_wendell_vaughn.sql",
  import.meta.url,
);

describe("artifact idempotency migration", () => {
  it("adds the nullable producer key and its project-scoped uniqueness boundary", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain(
      'ALTER TABLE "artifacts" ADD COLUMN "idempotency_key" varchar(256)',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "artifacts_project_id_idempotency_key_unique"',
    );
    expect(migration).toContain('("project_id","idempotency_key")');
  });
});
