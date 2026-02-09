import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    vi.clearAllMocks();
    state.embedTexts.mockImplementation(async (inputs: readonly string[]) => {
      return inputs.map(() => [0, 0, 0]);
    });
  });

  it("indexes bounded repo content and deletes by prefix", async () => {
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

  it("throws when git HEAD cannot be resolved", async () => {
    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const runGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 1, stderr: "nope", stdout: "" };
      }
      return { exitCode: 0, stderr: "", stdout: "" };
    });

    await expect(
      indexRepoFromSandbox({
        projectId: "proj_1",
        repoId: "repo_1",
        runGit,
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });
  });

  it("throws when repo files cannot be listed", async () => {
    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const runGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 0, stderr: "", stdout: "deadbeef\n" };
      }
      if (cmd.includes("ls-files")) {
        return { exitCode: 1, stderr: "nope", stdout: "" };
      }
      return { exitCode: 0, stderr: "", stdout: "" };
    });

    await expect(
      indexRepoFromSandbox({
        projectId: "proj_1",
        repoId: "repo_1",
        runGit,
      }),
    ).rejects.toMatchObject({ code: "bad_gateway", status: 502 });
  });

  it("includes language metadata for supported file types and throws on embedding batch mismatch", async () => {
    state.embedTexts.mockResolvedValueOnce([[0, 0, 0]]);

    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const contents = new Map<string, string>([
      ["main.py", "print('hi')\n"],
      ["empty.txt", ""],
    ]);
    const sizes = new Map<string, number>([
      ["main.py", 12],
      ["empty.txt", 0],
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
          stdout: ["main.py", "empty.txt"].join("\n"),
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

    await indexRepoFromSandbox({
      projectId: "proj_1",
      repoId: "repo_1",
      runGit,
    });

    const upsertPayload = state.vectorUpsert.mock.calls.at(-1)?.[0] as
      | Array<{ metadata?: Record<string, unknown> }>
      | undefined;
    expect(upsertPayload?.[0]?.metadata?.language).toBe("python");

    // Now force an embedding mismatch to hit the error path.
    state.embedTexts.mockResolvedValueOnce([]); // mismatch
    await expect(
      indexRepoFromSandbox({
        projectId: "proj_1",
        repoId: "repo_1",
        runGit,
      }),
    ).rejects.toMatchObject({ code: "embed_failed", status: 500 });
  });

  it("skips excluded/unreadable/too-large files and rejects invalid paths", async () => {
    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const contents = new Map<string, string>([
      ["src/app.ts", "export const x = 1;\n"],
      ["bad/path.ts", "export const y = 2;\n"],
      ["empty.md", "   \n"],
      ["big-chunks.txt", `${"x".repeat(2000)}\n${"y".repeat(2000)}\n`],
    ]);

    const sizes = new Map<string, string>([
      ["src/app.ts", "24"],
      ["bad/path.ts", "24"],
      ["empty.md", "3"],
      ["unreadable.ts", "10"],
      ["invalidsize.ts", "NaN"],
      ["large.ts", "40001"],
      ["big-chunks.txt", "40000"],
    ]);

    const lsFiles = [
      ".git/config",
      "node_modules/foo.js",
      "image.png",
      ".env.local",
      "id_rsa",
      "src/app.ts",
      "bad\\path.ts",
      "empty.md",
      "unreadable.ts",
      "invalidsize.ts",
      "large.ts",
      "big-chunks.txt",
    ].join("\r\n");

    const runGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");

      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 0, stderr: "", stdout: "deadbeef\n" };
      }

      if (cmd.includes("ls-files")) {
        return { exitCode: 0, stderr: "", stdout: lsFiles };
      }

      if (cmd.includes("cat-file -s")) {
        const last = args.at(-1) ?? "";
        const pathPart = String(last).slice("HEAD:".length);
        if (pathPart === "unreadable.ts") {
          return { exitCode: 1, stderr: "nope", stdout: "" };
        }
        return {
          exitCode: 0,
          stderr: "",
          stdout: String(sizes.get(pathPart) ?? "0"),
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

    const res = await indexRepoFromSandbox({
      projectId: "proj_1",
      repoId: "repo_1",
      runGit,
    });

    expect(res.skipped.excluded).toBeGreaterThanOrEqual(5);
    expect(res.skipped.unreadable).toBeGreaterThanOrEqual(2);
    expect(res.skipped.tooLarge).toBeGreaterThanOrEqual(1);
    expect(res.filesIndexed).toBeGreaterThanOrEqual(2);

    // Normalizes path separators (\\ -> /) before invoking git show.
    const showArgs = runGit.mock.calls
      .map((c) => (c[0] as { args?: readonly string[] } | undefined)?.args)
      .filter((args): args is readonly string[] => Array.isArray(args))
      .filter((args) => args.includes("show"));
    expect(
      showArgs.some((args) =>
        String(args.at(-1) ?? "").includes("HEAD:bad/path.ts"),
      ),
    ).toBe(true);

    const upsertPayload = state.vectorUpsert.mock.calls.at(-1)?.[0] as
      | Array<{ metadata: { snippet: string } }>
      | undefined;
    // Long chunks get truncated snippets with ellipsis.
    expect(upsertPayload?.some((r) => r.metadata.snippet.endsWith("…"))).toBe(
      true,
    );

    // Invalid paths are rejected at normalization time.
    const badRunGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");
      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 0, stderr: "", stdout: "deadbeef\n" };
      }
      if (cmd.includes("ls-files")) {
        return { exitCode: 0, stderr: "", stdout: "../secrets.txt\n" };
      }
      return { exitCode: 0, stderr: "", stdout: "" };
    });

    await expect(
      indexRepoFromSandbox({
        projectId: "proj_1",
        repoId: "repo_1",
        runGit: badRunGit,
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("detects languages for common extensions and omits language when unknown", async () => {
    const { indexRepoFromSandbox } = await import(
      "@/lib/repo/repo-indexer.server"
    );

    const files = [
      "src/app.ts",
      "src/app.tsx",
      "src/app.js",
      "src/app.jsx",
      "data/config.json",
      "README.md",
      "docs/page.mdx",
      "ci/workflow.yml",
      "ci/workflow.yaml",
      "bunfig.toml",
      "styles/site.css",
      "index.html",
      "schema.sql",
      "script.py",
      "main.go",
      "lib.rs",
      "Main.java",
      "Main.kt",
      "script.sh",
      "notes.txt",
    ] as const;

    const contents = new Map<string, string>();
    const sizes = new Map<string, string>();
    for (const f of files) {
      contents.set(f, `// ${f}\n`);
      sizes.set(f, "12");
    }

    const runGit = vi.fn(async ({ args }: { args: readonly string[] }) => {
      const cmd = args.join(" ");

      if (cmd.includes("rev-parse HEAD")) {
        return { exitCode: 0, stderr: "", stdout: "deadbeef\n" };
      }

      if (cmd.includes("ls-files")) {
        return { exitCode: 0, stderr: "", stdout: files.join("\n") };
      }

      if (cmd.includes("cat-file -s")) {
        const last = args.at(-1) ?? "";
        const pathPart = String(last).slice("HEAD:".length);
        return {
          exitCode: 0,
          stderr: "",
          stdout: String(sizes.get(pathPart) ?? "0"),
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

    await indexRepoFromSandbox({
      projectId: "proj_1",
      repoId: "repo_1",
      runGit,
    });

    const upsertPayload = state.vectorUpsert.mock.calls.at(-1)?.[0] as
      | Array<{ metadata?: Record<string, unknown> }>
      | undefined;
    const languages = new Map<string, string | undefined>();
    for (const item of upsertPayload ?? []) {
      const meta = item.metadata ?? {};
      const path = typeof meta.path === "string" ? meta.path : "";
      const language =
        typeof meta.language === "string" ? meta.language : undefined;
      if (path) languages.set(path, language);
    }

    expect(languages.get("src/app.ts")).toBe("typescript");
    expect(languages.get("src/app.tsx")).toBe("typescript");
    expect(languages.get("src/app.js")).toBe("javascript");
    expect(languages.get("src/app.jsx")).toBe("javascript");
    expect(languages.get("data/config.json")).toBe("json");
    expect(languages.get("README.md")).toBe("markdown");
    expect(languages.get("docs/page.mdx")).toBe("markdown");
    expect(languages.get("ci/workflow.yml")).toBe("yaml");
    expect(languages.get("ci/workflow.yaml")).toBe("yaml");
    expect(languages.get("bunfig.toml")).toBe("toml");
    expect(languages.get("styles/site.css")).toBe("css");
    expect(languages.get("index.html")).toBe("html");
    expect(languages.get("schema.sql")).toBe("sql");
    expect(languages.get("script.py")).toBe("python");
    expect(languages.get("main.go")).toBe("go");
    expect(languages.get("lib.rs")).toBe("rust");
    expect(languages.get("Main.java")).toBe("java");
    expect(languages.get("Main.kt")).toBe("kotlin");
    expect(languages.get("script.sh")).toBe("shell");
    expect(languages.get("notes.txt")).toBeUndefined();
  });
});
