import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { ProjectNavClient } from "@/app/(app)/projects/[projectId]/project-nav-client";
import { Separator } from "@/components/ui/separator";
import { getProjectById } from "@/lib/data/projects.server";

/**
 * Project-scoped layout: header + tabs.
 *
 * @param props - Layout props.
 * @returns The project layout.
 */
export default async function ProjectLayout(
  props: Readonly<{
    children: ReactNode;
    params: Promise<{ projectId: string }>;
  }>,
) {
  const { children } = props;
  const { projectId } = await props.params;

  const project = await getProjectById(projectId);
  if (!project) notFound();

  return (
    <div className="flex flex-1 flex-col gap-6 pt-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-muted-foreground text-sm">Project</p>
          <h1 className="font-semibold text-2xl tracking-tight">
            {project.name}
          </h1>
          <p className="text-muted-foreground text-sm">{project.slug}</p>
        </div>
        <Link
          className="text-sm underline-offset-4 hover:underline"
          href="/projects"
        >
          All projects
        </Link>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-24 rounded-md bg-muted" />
            <div className="h-9 w-24 rounded-md bg-muted" />
            <div className="h-9 w-24 rounded-md bg-muted" />
          </div>
        }
      >
        <ProjectNavClient projectId={project.id} />
      </Suspense>
      <Separator />

      {children}
    </div>
  );
}
