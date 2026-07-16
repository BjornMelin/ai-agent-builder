import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL("./0012_short_frog_thor.sql", import.meta.url);

describe("provider provenance tombstone migration", () => {
  it("preserves deployment and infrastructure records after project deletion", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain(
      'ALTER TABLE "deployments" DROP CONSTRAINT "deployments_project_id_projects_id_fk"',
    );
    expect(migration).toContain(
      'ALTER TABLE "infra_resources" DROP CONSTRAINT "infra_resources_project_id_projects_id_fk"',
    );
    expect(migration).not.toContain("project_files_project_id_projects_id_fk");
    expect(migration).not.toContain("file_chunks_project_id_projects_id_fk");
  });
});
