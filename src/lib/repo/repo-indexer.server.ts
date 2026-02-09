import "server-only";

import path from "node:path";

import { embedTexts } from "@/lib/ai/embeddings.server";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import {
  getVectorIndex,
  projectRepoNamespace,
  type VectorMetadata,
} from "@/lib/upstash/vector.server";

type SandboxRunCommand = (
  input: Readonly<{
    cmd: string;
    args: readonly string[];
    cwd?: string;
  }>,
) => Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>>;

const SANDBOX_REPO_ROOT = "/vercel/sandbox";

const INDEX_PREFIX = "repo";

// Conservative budgets for repo indexing. This is intentionally smaller than
// "index the whole repo" to keep costs bounded and avoid pulling secrets.
const MAX_FILES_TO_INDEX = 400;
const MAX_TOTAL_BYTES = 2_000_000;
const MAX_FILE_BYTES = 40_000;
const TARGET_CHARS = 1_800;
const OVERLAP_CHARS = 200;
const MAX_CHUNKS_TOTAL = 2_000;

const EXCLUDED_DIR_PREFIXES: readonly string[] = [
  ".git/",
  ".next/",
  ".turbo/",
  ".vercel/",
  "build/",
  "coverage/",
  "dist/",
  "node_modules/",
  "out/",
  "vendor/",
] as const;

const EXCLUDED_FILE_NAMES: ReadonlySet<string> = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.preview",
  ".npmrc",
  ".pnpmrc",
  "id_rsa",
  "id_ed25519",
]);

const EXCLUDED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".7z",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp4",
  ".mov",
  ".mp3",
  ".wav",
]);

function normalizeRepoPath(value: string): string {
  const unix = value.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  if (!unix) throw new AppError("bad_request", 400, "Invalid repo file path.");
  if (unix.includes("\0")) {
    throw new AppError("bad_request", 400, "Invalid repo file path.");
  }
  if (unix.startsWith("~") || unix.includes("..")) {
    throw new AppError("bad_request", 400, "Invalid repo file path.");
  }
  return unix;
}

function isExcludedPath(relPath: string): boolean {
  for (const prefix of EXCLUDED_DIR_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }

  const base = path.posix.basename(relPath);
  if (EXCLUDED_FILE_NAMES.has(base)) return true;

  const ext = path.posix.extname(relPath).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) return true;

  return false;
}

function detectLanguage(relPath: string): string | undefined {
  const ext = path.posix.extname(relPath).toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx":
      return "typescript";
    case ".js":
    case ".jsx":
      return "javascript";
    case ".json":
      return "json";
    case ".md":
    case ".mdx":
      return "markdown";
    case ".yml":
    case ".yaml":
      return "yaml";
    case ".toml":
      return "toml";
    case ".css":
      return "css";
    case ".html":
      return "html";
    case ".sql":
      return "sql";
    case ".py":
      return "python";
    case ".go":
      return "go";
    case ".rs":
      return "rust";
    case ".java":
      return "java";
    case ".kt":
      return "kotlin";
    case ".sh":
      return "shell";
    default:
      return undefined;
  }
}

function chunkText(text: string): readonly string[] {
  const normalized = text.replaceAll("\r\n", "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return [];

  const lines = trimmed.split("\n");
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    const out = buffer.trim();
    if (out.length > 0) chunks.push(out);
    buffer = "";
  };

  for (const line of lines) {
    const next = buffer.length === 0 ? line : `${buffer}\n${line}`;
    if (next.length <= TARGET_CHARS) {
      buffer = next;
      continue;
    }

    flush();
    buffer = line;
  }

  flush();

  if (chunks.length <= 1) return chunks;

  const withOverlap: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const current = chunks[i];
    if (!current) continue;
    const prevTail =
      i === 0 ? "" : (chunks[i - 1]?.slice(-OVERLAP_CHARS) ?? "");
    const merged = prevTail ? `${prevTail}\n\n${current}` : current;
    withOverlap.push(merged);
  }

  return withOverlap;
}

function parseLines(stdout: string): string[] {
  return stdout
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

function parseGitSize(stdout: string): number | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export type RepoIndexResult = Readonly<{
  commitSha: string;
  namespace: string;
  prefix: string;
  filesConsidered: number;
  filesIndexed: number;
  chunksIndexed: number;
  skipped: Readonly<{
    excluded: number;
    tooLarge: number;
    unreadable: number;
    budget: number;
  }>;
}>;

/**
 * Index a sandbox-checked-out git repo into Upstash Vector (latest-only strategy).
 *
 * @remarks
 * This is a bounded, best-effort indexer meant to support code-aware agent
 * planning. It avoids indexing binary/secret-like paths and enforces strict
 * size/count limits.
 *
 * @param input - Index inputs.
 * @returns Index result.
 */
export async function indexRepoFromSandbox(
  input: Readonly<{
    projectId: string;
    repoId: string;
    repoPath?: string;
    runGit: SandboxRunCommand;
  }>,
): Promise<RepoIndexResult> {
  const repoPath = input.repoPath ?? SANDBOX_REPO_ROOT;

  const shaRes = await input.runGit({
    args: ["-C", repoPath, "rev-parse", "HEAD"],
    cmd: "git",
  });
  if (shaRes.exitCode !== 0) {
    throw new AppError("bad_gateway", 502, "Failed to resolve repo HEAD SHA.");
  }
  const commitSha = shaRes.stdout.trim();
  if (!commitSha) {
    throw new AppError("bad_gateway", 502, "Failed to resolve repo HEAD SHA.");
  }

  const listRes = await input.runGit({
    args: ["-C", repoPath, "ls-files"],
    cmd: "git",
  });
  if (listRes.exitCode !== 0) {
    throw new AppError("bad_gateway", 502, "Failed to list repo files.");
  }

  const allFiles = parseLines(listRes.stdout).map(normalizeRepoPath);
  const namespace = projectRepoNamespace(input.projectId, input.repoId);
  const prefix = `${INDEX_PREFIX}:${input.repoId}:`;

  const candidates: string[] = [];
  let excluded = 0;
  for (const rel of allFiles) {
    if (isExcludedPath(rel)) {
      excluded += 1;
      continue;
    }
    candidates.push(rel);
  }

  // Stable order: paths as returned by git ls-files are already deterministic.
  const limited = candidates.slice(0, MAX_FILES_TO_INDEX);
  const vector = getVectorIndex().namespace(namespace);

  // Delete existing repo index (latest-only replacement).
  await vector.delete({ prefix });

  let totalBytes = 0;
  let filesIndexed = 0;
  let chunksIndexed = 0;
  let tooLarge = 0;
  let unreadable = 0;
  let budget = 0;

  const pendingTexts: string[] = [];
  const pendingRecords: Array<
    Readonly<{
      id: string;
      path: string;
      chunkIndex: number;
      language?: string;
      snippet: string;
    }>
  > = [];

  const flush = async () => {
    if (pendingTexts.length === 0) return;

    const embeddings: number[][] = [];
    for (let i = 0; i < pendingTexts.length; i += budgets.maxEmbedBatchSize) {
      const batch = pendingTexts.slice(i, i + budgets.maxEmbedBatchSize);
      const batchEmbeddings = await embedTexts(batch, { maxParallelCalls: 2 });
      embeddings.push(...batchEmbeddings);
    }

    if (embeddings.length !== pendingTexts.length) {
      throw new AppError("embed_failed", 500, "Embedding batch size mismatch.");
    }

    await vector.upsert(
      pendingRecords.map((rec, idx) => {
        const meta: VectorMetadata = {
          commitSha,
          path: rec.path,
          projectId: input.projectId,
          repoId: input.repoId,
          snippet: rec.snippet,
          type: "code",
          ...(rec.language === undefined ? {} : { language: rec.language }),
        };

        return {
          data: pendingTexts[idx] ?? "",
          id: rec.id,
          metadata: meta,
          vector: embeddings[idx] as number[],
        };
      }),
    );

    pendingTexts.length = 0;
    pendingRecords.length = 0;
  };

  for (const relPath of limited) {
    if (chunksIndexed >= MAX_CHUNKS_TOTAL) {
      budget += 1;
      break;
    }
    if (totalBytes >= MAX_TOTAL_BYTES) {
      budget += 1;
      break;
    }

    const sizeRes = await input.runGit({
      args: ["-C", repoPath, "cat-file", "-s", `HEAD:${relPath}`],
      cmd: "git",
    });
    if (sizeRes.exitCode !== 0) {
      unreadable += 1;
      continue;
    }

    const size = parseGitSize(sizeRes.stdout);
    if (size === null) {
      unreadable += 1;
      continue;
    }
    if (size > MAX_FILE_BYTES) {
      tooLarge += 1;
      continue;
    }
    if (totalBytes + size > MAX_TOTAL_BYTES) {
      budget += 1;
      break;
    }

    const contentRes = await input.runGit({
      args: ["-C", repoPath, "show", `HEAD:${relPath}`],
      cmd: "git",
    });
    if (contentRes.exitCode !== 0) {
      unreadable += 1;
      continue;
    }

    const raw = contentRes.stdout.replaceAll("\r\n", "\n").trim();
    if (!raw) continue;

    const chunks = chunkText(raw);
    if (chunks.length === 0) continue;

    const language = detectLanguage(relPath);
    filesIndexed += 1;
    totalBytes += size;

    for (let idx = 0; idx < chunks.length; idx += 1) {
      if (chunksIndexed >= MAX_CHUNKS_TOTAL) {
        budget += 1;
        break;
      }

      const text = chunks[idx] ?? "";
      if (!text) continue;

      const snippet = text.length > 240 ? `${text.slice(0, 240)}…` : text;
      const pathHash = sha256Hex(relPath);
      const id = `${prefix}${commitSha}:${pathHash}:${idx}`;

      pendingTexts.push(text);
      const recordBase = {
        chunkIndex: idx,
        id,
        path: relPath,
        snippet,
      } as const;
      pendingRecords.push(
        language === undefined ? recordBase : { ...recordBase, language },
      );
      chunksIndexed += 1;

      if (pendingTexts.length >= budgets.maxEmbedBatchSize) {
        await flush();
      }
    }

    if (chunksIndexed >= MAX_CHUNKS_TOTAL) break;
  }

  await flush();

  return {
    chunksIndexed,
    commitSha,
    filesConsidered: allFiles.length,
    filesIndexed,
    namespace,
    prefix,
    skipped: { budget, excluded, tooLarge, unreadable },
  };
}
