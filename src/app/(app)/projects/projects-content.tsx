import { FolderKanbanIcon } from "lucide-react";
import Link from "next/link";

import { CreateProjectForm } from "@/app/(app)/projects/create-project-form";
import {
  type ProjectListItem,
  ProjectsListClient,
} from "@/app/(app)/projects/projects-list-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { listProjects } from "@/lib/data/projects.server";

/**
 * Project list page content (suspends for request-time data).
 *
 * @param props - Optional project list options.
 * @returns The projects dashboard content.
 */
export async function ProjectsContent(
  props: Readonly<{
    limit?: number;
  }> = {},
) {
  const user = await requireAppUser();
  const limit = Math.min(Math.max(props.limit ?? 50, 1), 200);
  const projects = await listProjects(user.id, { limit });
  const items: readonly ProjectListItem[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-3xl tracking-tight">Projects</h1>
        <p className="text-muted-foreground text-sm">
          Create and manage project workspaces for uploads, retrieval, runs, and
          chat.
        </p>
      </header>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Create a project</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateProjectForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent projects</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <Empty className="min-h-[220px] border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderKanbanIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No projects yet</EmptyTitle>
                <EmptyDescription>
                  Start with a fresh project or create a demo workspace.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild size="sm">
                  <a href="#create-project-name">Create a project</a>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-3">
              <ProjectsListClient projects={items} />
              {projects.length >= limit ? (
                <div className="flex items-center justify-end gap-2 text-muted-foreground text-sm">
                  <span>Showing {limit} projects.</span>
                  {limit < 200 ? (
                    <Link
                      className="underline-offset-4 hover:underline"
                      href="/projects?limit=200"
                      prefetch={false}
                    >
                      View more
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
