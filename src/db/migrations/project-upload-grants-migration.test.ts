import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL("./0013_equal_zeigeist.sql", import.meta.url);

describe("project upload grants migration", () => {
  it("persists token expiry and cascades grants only with the final project delete", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain('CREATE TABLE "project_upload_grants"');
    expect(migration).toContain(
      '"expires_at" timestamp with time zone NOT NULL',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      'CREATE INDEX "project_upload_grants_project_id_expires_at_idx"',
    );
  });
});
