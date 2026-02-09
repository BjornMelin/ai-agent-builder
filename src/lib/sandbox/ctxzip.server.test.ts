import { describe, expect, it, vi } from "vitest";

import {
  createCtxZipSandboxCodeMode,
  type VercelSandboxLike,
} from "@/lib/sandbox/ctxzip.server";

function createSandboxStub(): VercelSandboxLike {
  return {
    runCommand: async () => ({
      exitCode: 0,
      stderr: async () => "",
      stdout: async () => "",
    }),
    sandboxId: "sbx_test_1",
    stop: async () => {},
    writeFiles: async () => {},
  };
}

describe("createCtxZipSandboxCodeMode", () => {
  it("returns the ctx-zip toolset", async () => {
    const sandbox = createSandboxStub();
    const session = await createCtxZipSandboxCodeMode({ sandbox });

    expect(Object.keys(session.tools)).toEqual(
      expect.arrayContaining([
        "sandbox_cat",
        "sandbox_delete_file",
        "sandbox_edit_file",
        "sandbox_exec",
        "sandbox_find",
        "sandbox_grep",
        "sandbox_lint",
        "sandbox_ls",
        "sandbox_write_file",
      ]),
    );
  });

  it("suppresses ctx-zip console spam (but still allows routing)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const captured: Array<{
      level: string;
      args: readonly unknown[];
    }> = [];

    const sandbox = createSandboxStub();
    const session = await createCtxZipSandboxCodeMode({
      consoleSink: (entry) => captured.push(entry),
      sandbox,
    });

    await session.manager.cleanup();

    expect(logSpy).not.toHaveBeenCalled();
    expect(captured.length).toBeGreaterThan(0);
  });
});
