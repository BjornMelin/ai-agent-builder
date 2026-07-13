import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "./0010_flashy_wendell_vaughn.sql",
  import.meta.url,
);

describe("sandbox lifecycle migration", () => {
  it("guards late legacy Workflow writes after the one-shot backfill", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain(
      'CREATE TRIGGER "sandbox_jobs_enforce_lifecycle_trigger"',
    );
    expect(migration).toContain('BEFORE INSERT OR UPDATE ON "sandbox_jobs"');
    expect(migration).toContain("parent_cancel_requested_at IS NOT NULL");
    expect(migration).toContain(`NULLIF(NEW."metadata"->>'sandboxId', '')`);
    expect(migration).toContain(`OLD."status" = 'canceling'`);
    expect(migration).toContain(`NEW."provisioning_expires_at" IS NULL`);
    expect(migration).toContain("INTERVAL '31 minutes'");
  });
});
