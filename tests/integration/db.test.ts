import { config as loadDotenv } from "dotenv";
import { eq, sql } from "drizzle-orm";
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

    try {
      const [created] = await db
        .insert(schema.projectsTable)
        .values({ name: "Test Project", slug })
        .returning();

      expect(created).toBeTruthy();
      if (!created) throw new Error("Expected inserted project row.");
      expect(created.slug).toBe(slug);
      createdId = created.id;

      const fetched = await db.query.projectsTable.findFirst({
        where: eq(schema.projectsTable.id, createdId),
      });

      expect(fetched).toBeTruthy();
      expect(fetched?.id).toBe(createdId);
    } finally {
      if (createdId) {
        await db
          .delete(schema.projectsTable)
          .where(eq(schema.projectsTable.id, createdId));
      }
    }

    if (createdId) {
      const deleted = await db.query.projectsTable.findFirst({
        where: eq(schema.projectsTable.id, createdId),
      });
      expect(deleted).toBeUndefined();
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
