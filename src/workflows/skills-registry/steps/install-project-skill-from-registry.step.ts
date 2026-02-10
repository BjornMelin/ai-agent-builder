import "server-only";

import { createHash } from "node:crypto";

import { del } from "@vercel/blob";
import { z } from "zod";

import {
  getProjectSkillBundleRef,
  getProjectSkillRegistryRef,
} from "@/lib/ai/skills/project-skill-metadata.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  findProjectSkillByNameUncached,
  findProjectSkillByRegistryId,
  updateProjectSkillById,
  upsertProjectSkill,
} from "@/lib/data/project-skills.server";
import { env } from "@/lib/env";
import { downloadGithubRepoZip } from "@/lib/skills-registry/github-archive.server";
import { parseSkillsRegistrySkillId } from "@/lib/skills-registry/registry-id.server";
import {
  getProjectSkillBundleBlobPath,
  putProjectSkillBundleBlob,
} from "@/lib/skills-registry/skill-bundle-blob.server";
import { resolveRegistrySkillFromRepoZip } from "@/lib/skills-registry/zip-skill-resolver.server";

const inputSchema = z.strictObject({
  projectId: z.string().min(1),
  registryId: z.string().min(1),
});

const MAX_SKILL_NAME_CHARS = 128;
const MAX_BLOB_SEGMENT_CHARS = 80;

function toSafeBlobSegment(value: string, maxChars: number): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_.-]+/g, "-").replace(/-+/g, "-");
  const base = normalized.length > 0 ? normalized : "skill";

  if (base.length <= maxChars) return base;

  const hash = createHash("sha256").update(base).digest("hex").slice(0, 12);
  const keep = Math.max(1, maxChars - (hash.length + 1));
  return `${base.slice(0, keep)}-${hash}`;
}

/**
 * Install (or update) a project skill from the skills.sh registry.
 *
 * @remarks
 * This step performs network I/O and Blob uploads, and persists the resolved
 * skill into the project's `project_skills` table.
 *
 * @param input - Project identity and registry id (`owner/repo/skillId`).
 * @returns Upserted skill summary (public-safe).
 * @throws AppError - When input validation fails or when registry resolution/install fails.
 */
export async function installProjectSkillFromRegistryStep(
  input: Readonly<{ projectId: string; registryId: string }>,
): Promise<
  Readonly<{
    skill: Readonly<{
      id: string;
      name: string;
      description: string;
      content: string;
      updatedAt: string;
    }>;
  }>
> {
  "use step";

  const parsedInput = inputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new AppError(
      "bad_request",
      400,
      "Invalid skills registry install input.",
      parsedInput.error,
    );
  }

  const ref = parseSkillsRegistrySkillId(parsedInput.data.registryId);

  const { bytes: repoZipBytes } = await downloadGithubRepoZip({
    owner: ref.owner,
    repo: ref.repo,
  });

  const resolved = await resolveRegistrySkillFromRepoZip({
    skillId: ref.skillId,
    zipBytes: repoZipBytes,
  });

  const resolvedNameTrimmed = resolved.name.trim();
  if (!resolvedNameTrimmed) {
    throw new AppError("bad_request", 400, "Invalid skill name.");
  }
  if (resolvedNameTrimmed.length > MAX_SKILL_NAME_CHARS) {
    throw new AppError("bad_request", 400, "Skill name too long.");
  }

  let existing = await findProjectSkillByRegistryId(
    parsedInput.data.projectId,
    ref.id,
  );
  if (!existing) {
    const collision = await findProjectSkillByNameUncached(
      parsedInput.data.projectId,
      resolvedNameTrimmed,
    );
    const collisionRegistryId = collision
      ? (getProjectSkillRegistryRef(collision.metadata)?.id ?? null)
      : null;
    if (collision && collisionRegistryId !== ref.id) {
      throw new AppError("conflict", 409, "Skill name already exists.");
    }
    existing = collisionRegistryId === ref.id ? collision : null;
  }

  const previousBundle = existing
    ? getProjectSkillBundleRef(existing.metadata)
    : null;

  const blobPath = getProjectSkillBundleBlobPath({
    projectId: parsedInput.data.projectId,
    skillName: toSafeBlobSegment(ref.id, MAX_BLOB_SEGMENT_CHARS),
  });

  const bundleBlobPathname = await putProjectSkillBundleBlob({
    blobPath,
    bytes: resolved.bundle.bytes,
  });

  const metadata = {
    bundle: {
      blobPath: bundleBlobPathname,
      fileCount: resolved.bundle.fileCount,
      format: "zip-v1" as const,
      sizeBytes: resolved.bundle.sizeBytes,
    },
    registry: {
      id: ref.id,
      skillId: ref.skillId,
      source: ref.source,
    },
  } satisfies Record<string, unknown>;

  const skill = existing
    ? await updateProjectSkillById({
        content: resolved.content,
        description: resolved.description,
        metadata,
        name: resolvedNameTrimmed,
        projectId: parsedInput.data.projectId,
        skillId: existing.id,
      })
    : await upsertProjectSkill({
        content: resolved.content,
        description: resolved.description,
        metadata,
        name: resolvedNameTrimmed,
        projectId: parsedInput.data.projectId,
      });

  if (
    previousBundle?.blobPath &&
    previousBundle.blobPath !== bundleBlobPathname
  ) {
    try {
      await del(previousBundle.blobPath, { token: env.blob.readWriteToken });
    } catch (error) {
      // Best-effort cleanup: orphaned bundles are acceptable and can be
      // garbage-collected separately if needed.
      log.error("project_skill_bundle_delete_failed", {
        err: error,
        previousBlobPath: previousBundle.blobPath,
        projectId: parsedInput.data.projectId,
        registryId: ref.id,
        skillName: resolvedNameTrimmed,
      });
    }
  }

  return {
    skill: {
      content: skill.content,
      description: skill.description,
      id: skill.id,
      name: skill.name,
      updatedAt: skill.updatedAt,
    },
  };
}
