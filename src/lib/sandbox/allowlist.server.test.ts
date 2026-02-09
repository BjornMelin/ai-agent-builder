import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/core/errors";
import { assertSandboxCommandAllowed } from "@/lib/sandbox/allowlist.server";

describe("assertSandboxCommandAllowed", () => {
  it("rejects commands that are not allowlisted", () => {
    expect(() =>
      assertSandboxCommandAllowed({ cmd: "curl", policy: "code_mode" }),
    ).toThrow(AppError);
  });

  it("rejects path traversal segments in any argument", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["../etc/passwd"],
        cmd: "cat",
        policy: "code_mode",
      }),
    ).toThrow(AppError);
  });

  it("rejects absolute paths outside the sandbox workspace root", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["/etc/passwd"],
        cmd: "cat",
        policy: "code_mode",
      }),
    ).toThrow(AppError);
  });

  it("allows absolute paths within /vercel/sandbox", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["/vercel/sandbox/package.json"],
        cmd: "cat",
        policy: "code_mode",
      }),
    ).not.toThrow();
  });

  it("restricts npx to an allowlisted package/bin", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["--yes", "biome", "--version"],
        cmd: "npx",
        policy: "implementation_run",
      }),
    ).not.toThrow();

    expect(() =>
      assertSandboxCommandAllowed({
        args: ["--yes", "definitely-not-allowlisted"],
        cmd: "npx",
        policy: "implementation_run",
      }),
    ).toThrow(AppError);
  });

  it("restricts bunx to an allowlisted package/bin", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["--bun", "shadcn", "--help"],
        cmd: "bunx",
        policy: "implementation_run",
      }),
    ).not.toThrow();

    expect(() =>
      assertSandboxCommandAllowed({
        args: ["some-random-pkg"],
        cmd: "bunx",
        policy: "implementation_run",
      }),
    ).toThrow(AppError);
  });

  it("blocks find -exec/-ok/-delete dispatch flags", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: [".", "-exec", "rm", "-rf", "/vercel/sandbox/tmp", "\\;"],
        cmd: "find",
        policy: "code_mode",
      }),
    ).toThrow(AppError);

    expect(() =>
      assertSandboxCommandAllowed({
        args: [".", "-delete"],
        cmd: "find",
        policy: "code_mode",
      }),
    ).toThrow(AppError);
  });

  it("blocks pnpm dlx and npm exec to avoid bypassing npx/bunx restrictions", () => {
    expect(() =>
      assertSandboxCommandAllowed({
        args: ["dlx", "biome"],
        cmd: "pnpm",
        policy: "implementation_run",
      }),
    ).toThrow(AppError);

    expect(() =>
      assertSandboxCommandAllowed({
        args: ["exec", "biome"],
        cmd: "npm",
        policy: "implementation_run",
      }),
    ).toThrow(AppError);
  });
});
