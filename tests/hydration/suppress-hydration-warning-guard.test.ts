import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWLIST = new Set<string>(["src/app/layout.tsx"]);
const TARGET_ROOTS = ["src/app", "src/components"] as const;
const SUPPRESS_PATTERN = "suppressHydrationWarning";

function collectSourceFiles(rootDir: string): string[] {
  const stack = [rootDir];
  const files: string[] = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (
        entry.isFile() &&
        (absolutePath.endsWith(".ts") || absolutePath.endsWith(".tsx"))
      ) {
        files.push(absolutePath);
      }
    }
  }

  return files;
}

function findSuppressHydrationWarnings(): string[] {
  const projectRoot = process.cwd();
  const results: string[] = [];

  for (const root of TARGET_ROOTS) {
    const absoluteRoot = path.join(projectRoot, root);
    if (!statSync(absoluteRoot).isDirectory()) {
      continue;
    }
    const files = collectSourceFiles(absoluteRoot);
    for (const file of files) {
      const relativePath = path.relative(projectRoot, file);
      const content = readFileSync(file, "utf8");
      if (!content.includes(SUPPRESS_PATTERN)) {
        continue;
      }
      if (ALLOWLIST.has(relativePath)) {
        continue;
      }
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (lines[index]?.includes(SUPPRESS_PATTERN)) {
          results.push(`${relativePath}:${index + 1}`);
        }
      }
    }
  }

  return results;
}

describe("hydration suppression guard", () => {
  it("disallows suppressHydrationWarning outside the allowlist", () => {
    const disallowedUsages = findSuppressHydrationWarnings();
    expect(disallowedUsages).toEqual([]);
  });
});
