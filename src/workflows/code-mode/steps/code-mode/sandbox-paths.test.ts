import { describe, expect, it } from "vitest";
import {
  resolveSandboxCwd,
  resolveSandboxPath,
  rewriteSandboxArgsForWorkspace,
  SANDBOX_WORKSPACE_ROOT,
} from "./sandbox-paths";

describe("sandbox paths", () => {
  it("resolves relative cwd into the sandbox workspace", () => {
    expect(resolveSandboxCwd("repo")).toBe(`${SANDBOX_WORKSPACE_ROOT}/repo`);
  });

  it("treats blank cwd as undefined", () => {
    expect(resolveSandboxCwd(" ")).toBeUndefined();
    expect(resolveSandboxCwd(undefined)).toBeUndefined();
  });

  it("rejects cwd outside the sandbox workspace", () => {
    expect(() => resolveSandboxCwd("/etc")).toThrow(/cwd must be within/i);
  });

  it("rejects path traversal in cwd", () => {
    expect(() => resolveSandboxCwd("../secrets")).toThrow(/invalid cwd/i);
    expect(() => resolveSandboxCwd("/vercel/sandbox/../secrets")).toThrow(
      /invalid cwd/i,
    );
  });

  it("resolves relative paths under the workspace and rejects escapes", () => {
    expect(resolveSandboxPath("foo.txt")).toBe(
      `${SANDBOX_WORKSPACE_ROOT}/foo.txt`,
    );
    expect(resolveSandboxPath("/vercel/sandbox/abs.txt")).toBe(
      "/vercel/sandbox/abs.txt",
    );

    expect(() => resolveSandboxPath("/etc/passwd")).toThrow(
      /path must be within/i,
    );
    expect(() => resolveSandboxPath("../secrets.txt")).toThrow(
      /invalid sandbox path/i,
    );
    expect(() => resolveSandboxPath("~/.ssh/id_rsa")).toThrow(
      /invalid sandbox path/i,
    );
  });

  it("rewrites ctx-zip tool args based on command conventions", () => {
    expect(rewriteSandboxArgsForWorkspace("cat", ["foo.txt"])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/foo.txt`,
    ]);

    expect(rewriteSandboxArgsForWorkspace("find", ["foo.txt"])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/foo.txt`,
    ]);

    expect(
      rewriteSandboxArgsForWorkspace("grep", ["needle", "foo.txt"]),
    ).toEqual(["needle", `${SANDBOX_WORKSPACE_ROOT}/foo.txt`]);

    expect(rewriteSandboxArgsForWorkspace("ls", ["-la", "foo.txt"])).toEqual([
      "-la",
      `${SANDBOX_WORKSPACE_ROOT}/foo.txt`,
    ]);

    expect(rewriteSandboxArgsForWorkspace("mkdir", ["-p", "nested"])).toEqual([
      "-p",
      `${SANDBOX_WORKSPACE_ROOT}/nested`,
    ]);

    expect(rewriteSandboxArgsForWorkspace("test", ["-f", "foo.txt"])).toEqual([
      "-f",
      `${SANDBOX_WORKSPACE_ROOT}/foo.txt`,
    ]);

    // Unknown commands should not be rewritten.
    expect(rewriteSandboxArgsForWorkspace("echo", ["no-rewrite"])).toEqual([
      "no-rewrite",
    ]);
  });
});
