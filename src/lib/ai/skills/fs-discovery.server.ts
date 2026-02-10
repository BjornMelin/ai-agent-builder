import "server-only";

import type { Dirent } from "node:fs";
import { open, readdir } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@/lib/core/errors";
import { parseSkillFrontmatter, stripSkillFrontmatter } from "./frontmatter";
import type { SkillMetadata } from "./types";

const SKILL_FILENAME = "SKILL.md";

const MAX_SKILL_FILE_BYTES = 512_000;
const MAX_SKILL_READ_FILE_BYTES = 128_000;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

async function readUtf8FileCapped(
  filePath: string,
  maxBytes: number,
): Promise<string> {
  const throwMappedFsError = (err: unknown): never => {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === "ENOENT") {
      throw new AppError("not_found", 404, "Skill file not found.", err);
    }
    if (code === "EISDIR") {
      throw new AppError("bad_request", 400, "Path must refer to a file.", err);
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new AppError("forbidden", 403, "Access denied.", err);
    }
    throw new AppError("internal_error", 500, "Unexpected error.", err);
  };

  const handle = await open(filePath, "r").catch((err): never =>
    throwMappedFsError(err),
  );
  try {
    const chunks: Buffer[] = [];
    let total = 0;

    // Read up to maxBytes + 1, then error if we cross the limit.
    // This avoids a stat()-then-read() TOCTOU pattern.
    while (true) {
      const remaining = maxBytes + 1 - total;
      if (remaining <= 0) {
        throw new AppError(
          "bad_request",
          400,
          `Skill file exceeds maximum size (${maxBytes} bytes).`,
        );
      }

      const buf = Buffer.alloc(Math.min(64 * 1024, remaining));
      const { bytesRead } = await handle
        .read(buf, 0, buf.length, null)
        .catch((err): never => throwMappedFsError(err));
      if (bytesRead === 0) break;

      total += bytesRead;
      if (total > maxBytes) {
        throw new AppError(
          "bad_request",
          400,
          `Skill file exceeds maximum size (${maxBytes} bytes).`,
        );
      }

      chunks.push(buf.subarray(0, bytesRead));
    }

    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    await handle.close();
  }
}

function assertRelativePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError("bad_request", 400, "Invalid path.");
  }
  if (
    trimmed === "." ||
    trimmed === "./" ||
    trimmed === ".\\" ||
    trimmed.endsWith("/") ||
    trimmed.endsWith("\\")
  ) {
    throw new AppError("bad_request", 400, "Path must refer to a file.");
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    throw new AppError("bad_request", 400, "Path must be relative.");
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) {
    throw new AppError("bad_request", 400, "Path traversal is not allowed.");
  }
  return trimmed;
}

function resolveWithin(baseDir: string, relativePath: string): string {
  const safeRel = assertRelativePath(relativePath);
  const resolved = path.resolve(baseDir, safeRel);
  const rel = path.relative(baseDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AppError(
      "bad_request",
      400,
      "Path must be within the skill directory.",
    );
  }
  return resolved;
}

/**
 * Discover filesystem skills under the provided root directories.
 *
 * @remarks
 * Roots are scanned in-order. The first skill with a given normalized name wins.
 *
 * @param roots - Absolute skill root directories.
 * @returns Skill metadata list for progressive disclosure.
 */
export async function discoverFilesystemSkills(
  roots: readonly string[],
): Promise<SkillMetadata[]> {
  const out: SkillMetadata[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(root, entry.name);
      const skillFile = path.join(skillDir, SKILL_FILENAME);

      let content: string;
      try {
        content = await readUtf8FileCapped(skillFile, MAX_SKILL_FILE_BYTES);
      } catch {
        continue;
      }

      let frontmatter: { name: string; description: string };
      try {
        frontmatter = parseSkillFrontmatter(content);
      } catch {
        continue;
      }

      const key = normalizeKey(frontmatter.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      out.push({
        description: frontmatter.description,
        location: skillDir,
        name: frontmatter.name,
        source: "fs",
      });
    }
  }

  return out;
}

/**
 * Load the markdown body for a filesystem skill.
 *
 * @param skillDirectory - Absolute skill directory.
 * @returns Skill markdown instructions with frontmatter removed.
 */
export async function loadFilesystemSkillBody(
  skillDirectory: string,
): Promise<string> {
  const skillFile = path.join(skillDirectory, SKILL_FILENAME);
  const raw = await readUtf8FileCapped(skillFile, MAX_SKILL_FILE_BYTES);
  return stripSkillFrontmatter(raw);
}

/**
 * Read a file within a filesystem skill directory with strict path safety.
 *
 * @param input - Skill directory and relative path.
 * @returns File content as UTF-8.
 */
export async function readFilesystemSkillFile(
  input: Readonly<{ skillDirectory: string; relativePath: string }>,
): Promise<string> {
  const resolved = resolveWithin(input.skillDirectory, input.relativePath);
  return await readUtf8FileCapped(resolved, MAX_SKILL_READ_FILE_BYTES);
}
