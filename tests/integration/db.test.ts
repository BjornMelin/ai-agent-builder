import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import * as schema from "@/db/schema";

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("db (integration)", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("connects and can round-trip a project row", async () => {
    const db = getDb();
    const slug = `test-${crypto.randomUUID()}`;

    const [created] = await db
      .insert(schema.projectsTable)
      .values({ name: "Test Project", slug })
      .returning();

    expect(created).toBeTruthy();
    if (!created) throw new Error("Expected inserted project row.");
    expect(created.slug).toBe(slug);
    const createdId = created.id;

    const fetched = await db.query.projectsTable.findFirst({
      where: eq(schema.projectsTable.id, createdId),
    });

    expect(fetched).toBeTruthy();
    expect(fetched?.id).toBe(createdId);

    await db
      .delete(schema.projectsTable)
      .where(eq(schema.projectsTable.id, createdId));

    const deleted = await db.query.projectsTable.findFirst({
      where: eq(schema.projectsTable.id, createdId),
    });

    expect(deleted).toBeUndefined();
  });

  it("has drizzle migrations table (after bun run db:migrate)", async () => {
    const db = getDb();
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_name = '__drizzle_migrations'`,
    );

    const rows =
      (result as unknown as { rows?: Array<{ table_name: string }> }).rows ??
      [];
    expect(rows.some((r) => r.table_name === "__drizzle_migrations")).toBe(
      true,
    );
  });
});
