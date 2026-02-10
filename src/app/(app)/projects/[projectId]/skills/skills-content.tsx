import path from "node:path";
import { notFound } from "next/navigation";

import { SkillsClient } from "@/app/(app)/projects/[projectId]/skills/skills-client";
import type {
  EffectiveSkillSummary,
  ProjectSkillSummary,
} from "@/app/(app)/projects/[projectId]/skills/skills-types";
import { listAvailableSkillsForProject } from "@/lib/ai/skills/index.server";
import {
  getProjectSkillBundleRef,
  getProjectSkillRegistryRef,
} from "@/lib/ai/skills/project-skill-metadata.server";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { listProjectSkillsByProject } from "@/lib/data/project-skills.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

function toOriginLabel(
  skill: Readonly<{ source: "db" | "fs"; location: string }>,
): string {
  if (skill.source === "db") return "Project override";
  return `Repo: ${path.basename(skill.location)}`;
}

/**
 * Skills tab content (suspends for request-time data).
 *
 * @param props - Skills content props containing the target projectId.
 * @returns Skills page UI.
 */
export async function SkillsContent(props: Readonly<{ projectId: string }>) {
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(props.projectId, user.id);
  if (!project) notFound();

  const [projectSkills, effectiveSkills] = await Promise.all([
    listProjectSkillsByProject(project.id),
    listAvailableSkillsForProject(project.id),
  ]);

  const projectSkillSummaries: ProjectSkillSummary[] = projectSkills.map(
    (skill) => {
      const registry = getProjectSkillRegistryRef(skill.metadata);
      const bundle = getProjectSkillBundleRef(skill.metadata);
      return {
        bundlePresent: Boolean(bundle?.blobPath),
        description: skill.description,
        id: skill.id,
        name: skill.name,
        origin: registry ? "registry" : "manual",
        registryId: registry?.id ?? null,
        registrySource: registry?.source ?? null,
        updatedAt: skill.updatedAt,
      };
    },
  );

  const effective: EffectiveSkillSummary[] = effectiveSkills.map((skill) => ({
    description: skill.description,
    name: skill.name,
    originLabel: toOriginLabel(skill),
    source: skill.source,
  }));

  return (
    <SkillsClient
      effectiveSkills={effective}
      projectId={project.id}
      projectSkills={projectSkillSummaries}
    />
  );
}
