import "server-only";

import { del } from "@vercel/blob";
import { z } from "zod";

import { getProjectSkillBundleRef } from "@/lib/ai/skills/project-skill-metadata.server";
import { AppError } from "@/lib/core/errors";
import { log } from "@/lib/core/log";
import {
  getProjectSkillByName,
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

function toSafeBlobSegment(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const normalized = trimmed.replace(/[^a-z0-9_.-]+/g, "-").replace(/-+/g, "-");
  return normalized.length > 0 ? normalized : "skill";
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

  const existing = await getProjectSkillByName(
    parsedInput.data.projectId,
    resolved.name,
  );
  const previousBundle = existing
    ? getProjectSkillBundleRef(existing.metadata)
    : null;

  const blobPath = getProjectSkillBundleBlobPath({
    projectId: parsedInput.data.projectId,
    skillName: toSafeBlobSegment(resolved.name),
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

  const skill = await upsertProjectSkill({
    content: resolved.content,
    description: resolved.description,
    metadata,
    name: resolved.name,
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
        skillName: resolved.name,
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
