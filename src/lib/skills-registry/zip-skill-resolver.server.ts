import "server-only";

import type { Readable } from "node:stream";
import JSZip from "jszip";

import { parseSkillFrontmatter } from "@/lib/ai/skills/frontmatter";
import { AppError } from "@/lib/core/errors";

const SKILL_FILENAME = "SKILL.md";

const MAX_SKILL_MD_BYTES = 512_000;
const MAX_BUNDLE_FILE_BYTES = 512_000;
const MAX_BUNDLE_TOTAL_BYTES = 5_000_000;
const MAX_BUNDLE_FILE_COUNT = 250;
const MAX_ARCHIVE_FILE_COUNT = 20_000;
const MAX_ZIP_ENTRY_NAME_CHARS = 512;

function isWebReadableStream(
  stream: unknown,
): stream is ReadableStream<Uint8Array> {
  return (
    typeof stream === "object" &&
    stream !== null &&
    "getReader" in stream &&
    typeof (stream as { getReader: unknown }).getReader === "function"
  );
}

function isNodeReadable(stream: unknown): stream is Readable {
  return (
    typeof stream === "object" &&
    stream !== null &&
    "on" in stream &&
    typeof (stream as { on: unknown }).on === "function" &&
    "off" in stream &&
    typeof (stream as { off: unknown }).off === "function" &&
    "destroy" in stream &&
    typeof (stream as { destroy: unknown }).destroy === "function"
  );
}

async function readStreamBytesCapped(
  stream: unknown,
  maxBytes: number,
  name: string,
): Promise<Uint8Array> {
  if (isWebReadableStream(stream)) {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          throw new AppError(
            "bad_request",
            400,
            `Zip entry exceeds maximum size (${maxBytes} bytes): ${name}`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  if (!isNodeReadable(stream)) {
    throw new AppError(
      "internal_error",
      500,
      `Zip entry stream was not a Node or Web readable stream: ${name}`,
    );
  }

  return await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
      stream.off("close", onClose);
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onError = (err: unknown) => {
      settle(() => reject(err));
    };

    const onClose = () => {
      // If the stream is destroyed due to cap enforcement, it'll close without ending.
      if (!settled) {
        settle(() =>
          reject(
            new AppError(
              "internal_error",
              500,
              `Zip entry stream closed unexpectedly: ${name}`,
            ),
          ),
        );
      }
    };

    const onData = (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        // Abort decompression early to avoid buffering large entries in memory.
        stream.destroy();
        settle(() =>
          reject(
            new AppError(
              "bad_request",
              400,
              `Zip entry exceeds maximum size (${maxBytes} bytes): ${name}`,
            ),
          ),
        );
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      settle(() => {
        const buf = Buffer.concat(chunks, total);
        resolve(buf);
      });
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    stream.once("close", onClose);
  });
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeZipPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function isSafeZipRelativePath(value: string): boolean {
  const normalized = normalizeZipPath(value).trim();
  if (!normalized) return false;
  if (normalized.startsWith("/")) return false;
  if (normalized.includes("\0")) return false;
  if (/(^|\/)\.\.(\/|$)/.test(normalized)) return false;
  return true;
}

function pickRootPrefix(fileNames: readonly string[]): string {
  if (fileNames.some((name) => !name.includes("/"))) {
    // Archives without a single top-level root dir should be treated as repo-relative.
    return "";
  }

  const roots = new Set<string>();
  for (const name of fileNames) {
    const seg = name.split("/")[0];
    if (seg) roots.add(seg);
  }
  if (roots.size === 0) return "";
  if (roots.size === 1) {
    const [only] = roots;
    return only ? `${only}/` : "";
  }

  // When multiple top-level roots exist, avoid guessing; callers should derive
  // any needed prefix from the matched skill path instead.
  return "";
}

async function readZipFileBytesCapped(
  zip: JSZip,
  name: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const file = zip.file(name);
  if (!file) {
    throw new AppError("not_found", 404, `Zip entry not found: ${name}`);
  }

  // Never trust ZIP metadata: enforce the cap on actual decompressed output.
  const stream: unknown = file.nodeStream("nodebuffer");
  return await readStreamBytesCapped(stream, maxBytes, name);
}

/**
 * Resolved skill payload extracted from a source repository archive.
 */
export type ResolvedRegistrySkill = Readonly<{
  name: string;
  description: string;
  /** Full SKILL.md content (including YAML frontmatter). */
  content: string;
  /** Skill directory within the source repository (posix, repo-relative). */
  repoDirectory: string;
  /** Bundle ZIP containing all files under the skill directory. */
  bundle: Readonly<{
    bytes: Uint8Array;
    fileCount: number;
    sizeBytes: number;
  }>;
}>;

/**
 * Resolve a registry skill from a GitHub repo archive ZIP.
 *
 * @param input - ZIP bytes and desired `skillId`.
 * @returns Resolved skill payload.
 * @throws AppError - With code `"not_found"` when the skill cannot be located.
 * @throws AppError - With code `"bad_request"` when the input is invalid or the archive violates size/path safety constraints.
 */
export async function resolveRegistrySkillFromRepoZip(
  input: Readonly<{ zipBytes: Uint8Array; skillId: string }>,
): Promise<ResolvedRegistrySkill> {
  const skillIdNorm = normalizeKey(input.skillId);
  if (!skillIdNorm) {
    throw new AppError("bad_request", 400, "Invalid skill id.");
  }

  const zip = await JSZip.loadAsync(input.zipBytes);
  const fileNames = Object.keys(zip.files);
  if (fileNames.length === 0) {
    throw new AppError("not_found", 404, "Repository archive was empty.");
  }
  const hasTopLevelFiles = fileNames.some((name) => !name.includes("/"));
  if (fileNames.length > MAX_ARCHIVE_FILE_COUNT) {
    throw new AppError(
      "bad_request",
      400,
      `Repository archive exceeds maximum file count (${MAX_ARCHIVE_FILE_COUNT}).`,
    );
  }

  for (const name of fileNames) {
    if (name.length > MAX_ZIP_ENTRY_NAME_CHARS) {
      throw new AppError(
        "bad_request",
        400,
        "Repository archive contains an excessively long path.",
      );
    }
  }

  const rootPrefix = pickRootPrefix(fileNames);
  const skillMdPaths = fileNames.filter((name) =>
    name.endsWith(SKILL_FILENAME),
  );

  type Candidate = Readonly<{
    path: string;
    name: string;
    description: string;
    content: string;
  }>;

  let match: Candidate | null = null;
  const decoder = new TextDecoder("utf-8");

  for (const skillPath of skillMdPaths) {
    let bytes: Uint8Array;
    try {
      bytes = await readZipFileBytesCapped(zip, skillPath, MAX_SKILL_MD_BYTES);
    } catch {
      continue;
    }
    const content = decoder.decode(bytes);

    let frontmatter: { name: string; description: string };
    try {
      frontmatter = parseSkillFrontmatter(content);
    } catch {
      continue;
    }

    if (normalizeKey(frontmatter.name) !== skillIdNorm) {
      continue;
    }

    match = {
      content,
      description: frontmatter.description,
      name: frontmatter.name,
      path: skillPath,
    };
    break;
  }

  if (!match) {
    // Fallback: match by directory name (…/<skillId>/SKILL.md).
    const expectedSuffix = `/${skillIdNorm}/${SKILL_FILENAME.toLowerCase()}`;
    const fallbackPath = skillMdPaths.find((p) =>
      p.toLowerCase().endsWith(expectedSuffix),
    );

    if (fallbackPath) {
      const bytes = await readZipFileBytesCapped(
        zip,
        fallbackPath,
        MAX_SKILL_MD_BYTES,
      );
      const content = decoder.decode(bytes);
      const frontmatter = parseSkillFrontmatter(content);
      match = {
        content,
        description: frontmatter.description,
        name: frontmatter.name,
        path: fallbackPath,
      };
    }
  }

  if (!match) {
    throw new AppError("not_found", 404, `Skill not found: ${input.skillId}`);
  }

  const matchRoot = match.path.split("/")[0] ?? "";
  const effectiveRootPrefix =
    rootPrefix || (!hasTopLevelFiles && matchRoot ? `${matchRoot}/` : "");

  const lastSlash = match.path.lastIndexOf("/");
  if (lastSlash <= 0) {
    throw new AppError(
      "not_found",
      404,
      "Skill directory could not be determined from archive path.",
    );
  }

  const dirWithRoot = match.path.slice(0, lastSlash); // no trailing slash
  const repoDirectory =
    effectiveRootPrefix && dirWithRoot.startsWith(effectiveRootPrefix)
      ? dirWithRoot.slice(effectiveRootPrefix.length)
      : dirWithRoot;

  const bundlePrefix = `${effectiveRootPrefix}${repoDirectory}/`;

  const bundleZip = new JSZip();
  let totalBytes = 0;
  let fileCount = 0;

  for (const name of fileNames) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    if (!name.startsWith(bundlePrefix)) continue;

    const relativePathRaw = name.slice(bundlePrefix.length);
    const relativePath = normalizeZipPath(relativePathRaw);
    if (!relativePath) continue;
    if (!isSafeZipRelativePath(relativePath)) continue;

    const bytes = await readZipFileBytesCapped(
      zip,
      name,
      MAX_BUNDLE_FILE_BYTES,
    );

    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_BUNDLE_TOTAL_BYTES) {
      throw new AppError(
        "bad_request",
        400,
        `Skill bundle exceeds maximum size (${MAX_BUNDLE_TOTAL_BYTES} bytes).`,
      );
    }

    fileCount += 1;
    if (fileCount > MAX_BUNDLE_FILE_COUNT) {
      throw new AppError(
        "bad_request",
        400,
        `Skill bundle exceeds maximum file count (${MAX_BUNDLE_FILE_COUNT}).`,
      );
    }

    bundleZip.file(relativePath, bytes);
  }

  if (!bundleZip.file(SKILL_FILENAME)) {
    throw new AppError("not_found", 404, "Skill bundle is missing SKILL.md.");
  }

  const bundleBytes = await bundleZip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    type: "uint8array",
  });

  return {
    bundle: {
      bytes: bundleBytes,
      fileCount,
      sizeBytes: bundleBytes.byteLength,
    },
    content: match.content,
    description: match.description,
    name: match.name,
    repoDirectory,
  };
}
