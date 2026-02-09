import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  embedTexts: vi.fn(),
  vectorDelete: vi.fn(),
  vectorUpsert: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings.server", () => ({
  embedTexts: state.embedTexts,
}));

vi.mock("@/lib/upstash/vector.server", () => ({
  getVectorIndex: () => ({
    namespace: () => ({
      delete: state.vectorDelete,
      upsert: state.vectorUpsert,
    }),
  }),
  projectRepoNamespace: (projectId: string, repoId: string) =>
    `project:${projectId}:repo:${repoId}`,
}));

describe("indexRepoFromSandbox", () => {
  it("indexes bounded repo content and deletes by prefix", async () => {
    state.embedTexts.mockImplementation(async (inputs: readonly string[]) => {
      return inputs.map(() => [0, 0, 0]);
    });

    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const contents = new Map<string, string>([
      ["src/index.ts", "export const hello = 1;\n"],
      ["README.md", "# Hi\n\nSome docs\n"],
    ]);
    const sizes = new Map<string, number>([
      ["src/index.ts", 24],
      ["README.md", 18],
      ["secrets/.env", 10],
      ["big.bin", 100_000],
    ]);

    const runGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");

      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 0, stderr: "", stdout: "deadbeef\n" };
      }

      if (cmd.includes("ls-files")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: ["src/index.ts", "README.md", "secrets/.env", "big.bin"].join(
            "\n",
          ),
        };
      }

      if (cmd.includes("cat-file -s")) {
        const last = args.at(-1) ?? "";
        const pathPart = String(last).slice("HEAD:".length);
        return {
          exitCode: 0,
          stderr: "",
          stdout: String(sizes.get(pathPart) ?? 0),
        };
      }

      if (cmd.includes("show")) {
        const last = args.at(-1) ?? "";
        const pathPart = String(last).slice("HEAD:".length);
        return {
          exitCode: 0,
          stderr: "",
          stdout: contents.get(pathPart) ?? "",
        };
      }

      return { exitCode: 1, stderr: "unknown", stdout: "" };
    });

    const result = await indexRepoFromSandbox({
      projectId: "proj_1",
      repoId: "repo_1",
      runGit,
    });

    expect(result.commitSha).toBe("deadbeef");
    expect(result.namespace).toBe("project:proj_1:repo:repo_1");
    expect(result.prefix).toBe("repo:repo_1:");
    expect(result.filesIndexed).toBe(2);
    expect(result.skipped.excluded).toBeGreaterThanOrEqual(1);
    expect(result.skipped.tooLarge).toBe(1);

    expect(state.vectorDelete).toHaveBeenCalledWith({ prefix: "repo:repo_1:" });
    expect(state.vectorUpsert).toHaveBeenCalled();

    const upsertPayload = state.vectorUpsert.mock.calls[0]?.[0] as unknown[];
    expect(upsertPayload.length).toBeGreaterThan(0);
    const first = upsertPayload[0] as {
      id: string;
      metadata: { type: string };
    };
    expect(first.id.startsWith("repo:repo_1:deadbeef:")).toBe(true);
    expect(first.metadata.type).toBe("code");
  });
});
