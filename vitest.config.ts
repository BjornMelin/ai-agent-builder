import path from "node:path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

const testInclude = [
  "src/**/*.{test,spec}.{ts,tsx}",
  "tests/**/*.{test,spec}.{ts,tsx}",
];
const typecheckExclude = [
  "**/node_modules/**",
  "**/.dist/**",
  "opensrc/**",
  ".next-docs/**",
];

export default defineConfig({
  plugins: [
    react(),
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
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
    environment: "node",
    exclude: [...configDefaults.exclude, "opensrc/**", ".next-docs/**"],
    include: testInclude,
    passWithNoTests: true,
    typecheck: {
      enabled: true,
      exclude: typecheckExclude,
      include: testInclude,
      tsconfig: "tsconfig.json",
    },
  },
});
