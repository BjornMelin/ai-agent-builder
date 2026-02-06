import "server-only";

const prefix = "aab";

function normalizeSegment(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Cache tag for the authenticated user's project index.
 *
 * @param userId - Authenticated user identifier.
 * @returns Stable cache tag.
 */
export function tagProjectsIndex(userId: string): string {
  return `${prefix}:projects:index:${normalizeSegment(userId)}`;
}

/**
 * Cache tag for a single project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagProject(projectId: string): string {
  return `${prefix}:project:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for artifact listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagArtifactsIndex(projectId: string): string {
  return `${prefix}:artifacts:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for upload/file listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagUploadsIndex(projectId: string): string {
  return `${prefix}:uploads:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for the local model catalog JSON.
 *
 * @returns Stable cache tag.
 */
export function tagModelCatalog(): string {
  return `${prefix}:models:catalog`;
}
