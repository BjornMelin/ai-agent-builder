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
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
    environment: "jsdom",
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
