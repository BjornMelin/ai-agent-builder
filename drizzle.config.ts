import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Ensure Drizzle tooling loads the same `.env*` hierarchy as Next.js.
// (Configs are allowed to read process.env directly; app runtime code should use `src/lib/env.ts`.)
loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;

const drizzleCommand = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("-"));
const commandsRequiringDb = new Set([
  "migrate",
  "push",
  "studio",
  "introspect",
  "up",
  "drop",
]);

if (!databaseUrl && drizzleCommand && commandsRequiringDb.has(drizzleCommand)) {
  throw new Error("DATABASE_URL is required for drizzle-kit.");
}

export default defineConfig({
  dbCredentials: {
    // `generate` does not require a live DB connection. Use a placeholder URL so
    // the config remains loadable in fresh clones/CI where DATABASE_URL is unset.
    url: databaseUrl ?? "postgresql://user:password@localhost:5432/postgres",
  },
  dialect: "postgresql",
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  strict: true,
  verbose: true,
});
