import path from "node:path";
import { loadEnvConfig } from "@next/env";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

// Ensure `.env*` values are available in tests, matching Next.js behavior.
loadEnvConfig(process.cwd());

const testInclude = [
  "src/**/*.{test,spec}.{ts,tsx}",
  "tests/**/*.{test,spec}.{ts,tsx}",
];

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  resolve: {
    alias: {
      "client-only": path.resolve(__dirname, "tests/mocks/empty.ts"),
      "server-only": path.resolve(__dirname, "tests/mocks/empty.ts"),
    },
  },
  test: {
    // Keep tests blazing fast by avoiding duplicate typechecking work.
    // CI runs `bun run typecheck` separately.
    coverage: {
      exclude: [
        ...configDefaults.exclude,
        "**/__tests__/**",
        "**/*.{test,spec}.{ts,tsx}",
      ],
      include: ["src/lib/**/*.{ts,tsx}", "src/workflows/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        branches: 70,
        functions: 75,
        lines: 80,
        statements: 80,
      },
    },
    environment: "node",
    exclude: [...configDefaults.exclude, "opensrc/**", ".next-docs/**"],
    include: testInclude,
    passWithNoTests: true,
    pool: "threads",
    restoreMocks: true,
  },
});
