import "server-only";

/**
 * Cache tag namespace prefix for this app ("AI Agent Builder").
 *
 * Cache tags are shared within a deployment, so we keep them namespaced to avoid
 * collisions with other apps/projects that may share the same cache backend.
 */
const CACHE_TAG_NAMESPACE = "aab";

function normalizeSegment(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error(
      `normalizeSegment(): expected a non-empty segment after normalization (input: ${JSON.stringify(
        value,
      )}).`,
    );
  }
  return normalized;
}

/**
 * Cache tag for the authenticated user's project index.
 *
 * @param userId - Authenticated user identifier.
 * @returns Stable cache tag.
 */
export function tagProjectsIndex(userId: string): string {
  return `${CACHE_TAG_NAMESPACE}:projects:index:${normalizeSegment(userId)}`;
}

/**
 * Cache tag for a single project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagProject(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:project:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for artifact listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagArtifactsIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:artifacts:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for upload/file listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagUploadsIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:uploads:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for repository listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagReposIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:repos:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for project skill listings and lookups.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagProjectSkillsIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:skills:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for approvals listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagApprovalsIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:approvals:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for deployment listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagDeploymentsIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:deployments:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for infra resource listings and lookups in a project.
 *
 * @param projectId - Project identifier.
 * @returns Stable cache tag.
 */
export function tagInfraResourcesIndex(projectId: string): string {
  return `${CACHE_TAG_NAMESPACE}:infra-resources:index:${normalizeSegment(projectId)}`;
}

/**
 * Cache tag for the local model catalog JSON.
 *
 * @returns Stable cache tag.
 */
export function tagModelCatalog(): string {
  return `${CACHE_TAG_NAMESPACE}:models:catalog`;
}
