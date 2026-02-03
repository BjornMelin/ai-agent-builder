import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Drizzle DB client type with full relational schema typing enabled.
 */
export type DbClient = NodePgDatabase<typeof schema>;

type DbState = Readonly<{
  db: DbClient;
  pool: Pool;
}>;

function createDbState(): DbState {
  // Vercel recommends a low idle timeout (~5s) on Fluid compute so idle
  // connections are released before suspend while preserving reuse.
  // https://vercel.com/kb/guide/connection-pooling-with-functions
  const pool = new Pool({
    connectionString: env.db.databaseUrl,
    // Conservative default; can be increased once workload/concurrency requires it.
    ...(env.runtime.isVercel ? { idleTimeoutMillis: 5_000, max: 1 } : {}),
  });

  // On Vercel Fluid compute, a pooled TCP connection is recommended.
  // https://neon.com/docs/guides/vercel-connection-methods
  // https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
  if (env.runtime.isVercel) {
    attachDatabasePool(pool);
  }

  return {
    db: drizzle<typeof schema>({ client: pool, schema }),
    pool,
  };
}

let cachedDbState: DbState | undefined;

/**
 * Get the DB client (lazy-initialized).
 *
 * This ensures missing `DATABASE_URL` does not break unrelated builds/tests that
 * don't touch the DB feature gate.
 *
 * @returns A configured Drizzle client.
 */
export function getDb(): DbClient {
  cachedDbState ??= createDbState();
  return cachedDbState.db;
}

/**
 * Close the underlying pool (integration tests / one-off scripts only).
 *
 * Do not call this from request handlers.
 */
export async function closeDb(): Promise<void> {
  if (!cachedDbState) return;
  await cachedDbState.pool.end();
  cachedDbState = undefined;
}
