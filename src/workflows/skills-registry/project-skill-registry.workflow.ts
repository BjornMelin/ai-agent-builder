import { installProjectSkillFromRegistryStep } from "@/workflows/skills-registry/steps/install-project-skill-from-registry.step";

/**
 * Durable workflow that installs a project skill from the skills.sh registry.
 *
 * @param projectId - Project identifier.
 * @param registryId - Registry id (`owner/repo/skillId`).
 * @returns Upserted skill summary.
 */
export async function installProjectSkillFromRegistry(
  projectId: string,
  registryId: string,
): Promise<Awaited<ReturnType<typeof installProjectSkillFromRegistryStep>>> {
  "use workflow";

  return await installProjectSkillFromRegistryStep({ projectId, registryId });
}
