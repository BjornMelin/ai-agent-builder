import "server-only";

import JSZip from "jszip";

import { parseSkillFrontmatter } from "@/lib/ai/skills/frontmatter";
import { AppError } from "@/lib/core/errors";

const SKILL_FILENAME = "SKILL.md";

const MAX_SKILL_MD_BYTES = 512_000;
const MAX_BUNDLE_FILE_BYTES = 512_000;
const MAX_BUNDLE_TOTAL_BYTES = 5_000_000;
const MAX_BUNDLE_FILE_COUNT = 250;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function pickRootPrefix(fileNames: readonly string[]): string {
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

  // GitHub archives should have a single root dir; if not, choose the shortest.
  const sorted = Array.from(roots).sort((a, b) => a.length - b.length);
  const chosen = sorted[0];
  return chosen ? `${chosen}/` : "";
}

async function readZipFileBytes(zip: JSZip, name: string): Promise<Uint8Array> {
  const file = zip.file(name);
  if (!file) {
    throw new AppError("not_found", 404, `Zip entry not found: ${name}`);
  }
  return await file.async("uint8array");
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
    const bytes = await readZipFileBytes(zip, skillPath);
    if (bytes.byteLength > MAX_SKILL_MD_BYTES) {
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
    const fallbackPath = skillMdPaths.find((p) => {
      const rel =
        rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p;
      return rel.toLowerCase().endsWith(expectedSuffix);
    });

    if (fallbackPath) {
      const bytes = await readZipFileBytes(zip, fallbackPath);
      if (bytes.byteLength > MAX_SKILL_MD_BYTES) {
        throw new AppError(
          "bad_request",
          400,
          `SKILL.md exceeds maximum size (${MAX_SKILL_MD_BYTES} bytes).`,
        );
      }
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
    rootPrefix && dirWithRoot.startsWith(rootPrefix)
      ? dirWithRoot.slice(rootPrefix.length)
      : dirWithRoot;

  const bundlePrefix = `${rootPrefix}${repoDirectory}/`;

  const bundleZip = new JSZip();
  let totalBytes = 0;
  let fileCount = 0;

  for (const name of fileNames) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    if (!name.startsWith(bundlePrefix)) continue;

    const relativePath = name.slice(bundlePrefix.length);
    if (!relativePath) continue;

    const bytes = await readZipFileBytes(zip, name);
    if (bytes.byteLength > MAX_BUNDLE_FILE_BYTES) {
      throw new AppError(
        "bad_request",
        400,
        `Skill bundle file exceeds maximum size (${MAX_BUNDLE_FILE_BYTES} bytes).`,
      );
    }

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
