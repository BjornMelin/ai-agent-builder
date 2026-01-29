import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      ignoreConfigErrors: true,
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
    exclude: ["opensrc/**", ".next-docs/**"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    passWithNoTests: true,
    typecheck: {
      exclude: ["opensrc/**", ".next-docs/**"],
      enabled: true,
      include: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "tests/**/*.test.ts",
        "tests/**/*.test.tsx",
      ],
      tsconfig: "tsconfig.json",
    },
  },
});
