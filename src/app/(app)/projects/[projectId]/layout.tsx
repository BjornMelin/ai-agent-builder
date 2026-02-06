import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";

import { ProjectNavClient } from "@/app/(app)/projects/[projectId]/project-nav-client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

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
  await connection();
  const { children } = props;
  const { projectId } = await props.params;
  const user = await requireAppUser();

  const project = await getProjectByIdForUser(projectId, user.id);
  if (!project) notFound();

  return (
    <div className="flex flex-1 flex-col gap-5">
      <header className="from-background to-muted/30 rounded-2xl border bg-gradient-to-br p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <Badge className="rounded-full" variant="secondary">
              Project Workspace
            </Badge>
            <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
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
        </div>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-20 rounded-full bg-muted" />
            <div className="h-8 w-20 rounded-full bg-muted" />
            <div className="h-8 w-20 rounded-full bg-muted" />
          </div>
        }
      >
        <ProjectNavClient projectId={project.id} />
      </Suspense>
      <Separator />

      <Suspense
        fallback={
          <div className="text-muted-foreground text-sm">Loading project…</div>
        }
      >
        <div className="flex flex-1 flex-col pb-4">{children}</div>
      </Suspense>
    </div>
  );
}
