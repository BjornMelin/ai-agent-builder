import "server-only";

import { z } from "zod";

/**
 * Metadata describing a skill installed from an external registry.
 *
 * @remarks
 * Stored in `project_skills.metadata`. This data is server-only and must be
 * redacted before sending skill records to the client.
 */
export type ProjectSkillRegistryRef = Readonly<{
  /** Canonical registry identifier (`owner/repo/skillId`). */
  id: string;
  /** Source repository (`owner/repo`). */
  source: string;
  /** Skill identifier within the source repository. */
  skillId: string;
}>;

/**
 * Metadata describing the bundle used to back `skills.readFile` for DB skills.
 *
 * @remarks
 * Bundles are uploaded to Vercel Blob and treated as sensitive even though they
 * are currently publicly accessible.
 */
export type ProjectSkillBundleRef = Readonly<{
  /** Vercel Blob pathname for the bundle ZIP. */
  blobPath: string;
  /** Bundle format version. */
  format: "zip-v1";
  /** Number of files included in the bundle. */
  fileCount: number;
  /** Bundle size in bytes (compressed). */
  sizeBytes: number;
}>;

const registryRefSchema = z.strictObject({
  id: z.string().min(1),
  skillId: z.string().min(1),
  source: z.string().min(1),
});

const bundleRefSchema = z.strictObject({
  blobPath: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
  format: z.literal("zip-v1"),
  sizeBytes: z.number().int().nonnegative(),
});

const projectSkillMetadataSchema = z.looseObject({
  bundle: bundleRefSchema.optional(),
  registry: registryRefSchema.optional(),
});

/**
 * Extract the registry reference from a project skill metadata JSON blob.
 *
 * @param metadata - Raw `project_skills.metadata`.
 * @returns Registry reference or null when missing/invalid.
 */
export function getProjectSkillRegistryRef(
  metadata: Record<string, unknown>,
): ProjectSkillRegistryRef | null {
  const parsed = projectSkillMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data.registry ?? null;
}

/**
 * Extract the bundle reference from a project skill metadata JSON blob.
 *
 * @param metadata - Raw `project_skills.metadata`.
 * @returns Bundle reference or null when missing/invalid.
 */
export function getProjectSkillBundleRef(
  metadata: Record<string, unknown>,
): ProjectSkillBundleRef | null {
  const parsed = projectSkillMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data.bundle ?? null;
}
