import { config as loadDotenv } from "dotenv";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import * as schema from "@/db/schema";

// Next.js intentionally does not load `.env.local` in `NODE_ENV=test`.
// Integration tests depend on local DB credentials, so we load it explicitly.
loadDotenv({ override: false, path: ".env.local", quiet: true });

if (
  (!process.env.DATABASE_URL || process.env.DATABASE_URL.length === 0) &&
  process.env.DATABASE_URL_UNPOOLED &&
  process.env.DATABASE_URL_UNPOOLED.length > 0
) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("db (integration)", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("connects and can round-trip a project row", async () => {
    const db = getDb();
    const slug = `test-${crypto.randomUUID()}`;
    let createdId: string | null = null;
    const ownerColumnQuery = await db.execute<{ present: number }>(sql`
      select 1 as present
      from information_schema.columns
      where table_name = 'projects'
        and column_name = 'owner_user_id'
    `);
    const ownerColumnRows = ownerColumnQuery.rows;
    const hasOwnerUserId = ownerColumnRows.length > 0;

    try {
      let created: { id: string; slug: string } | undefined;

      if (hasOwnerUserId) {
        const [inserted] = await db
          .insert(schema.projectsTable)
          .values({
            name: "Test Project",
            ownerUserId: "integration-test-user",
            slug,
          })
          .returning({
            id: schema.projectsTable.id,
            slug: schema.projectsTable.slug,
          });
        created = inserted;
      } else {
        const legacyInsert = await db.execute<{ id: string; slug: string }>(sql`
          insert into "projects" ("name", "slug")
          values ('Test Project', ${slug})
          returning "id", "slug"
        `);
        created = legacyInsert.rows[0];
      }

      expect(created).toBeTruthy();
      if (!created) throw new Error("Expected inserted project row.");
      expect(created.slug).toBe(slug);
      createdId = created.id;

      const fetched = await db.execute<{ id: string }>(sql`
        select "id"
        from "projects"
        where "id" = ${createdId}
        limit 1
      `);

      expect(fetched.rows.at(0)?.id).toBe(createdId);
    } finally {
      if (createdId) {
        let deleteSucceeded = false;
        try {
          await db.execute(sql`
            delete from "projects"
            where "id" = ${createdId}
          `);
          deleteSucceeded = true;
        } finally {
          if (deleteSucceeded) {
            const deleted = await db.execute<{ id: string }>(sql`
              select "id"
              from "projects"
              where "id" = ${createdId}
              limit 1
            `);
            expect(deleted.rows.length).toBe(0);
          }
        }
      }
    }
  });

  it("has drizzle migrations table (after bun run db:migrate)", async () => {
    const db = getDb();
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_name = '__drizzle_migrations'`,
    );

    const rows =
      (result as { rows?: Array<{ table_name?: string }> }).rows ?? [];
    expect(rows.some((r) => r.table_name === "__drizzle_migrations")).toBe(
      true,
    );
  });
});
