import Link from "next/link";
import { CreateProjectForm } from "@/app/(app)/projects/create-project-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjects } from "@/lib/data/projects.server";

/**
 * Project list page.
 *
 * @returns The projects list page.
 */
export default async function ProjectsPage() {
  const projects = await listProjects({ limit: 50 });

  return (
    <div className="flex flex-col gap-6 pt-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Projects</h1>
        <p className="text-muted-foreground text-sm">
          Pick a project to upload sources, chat with your knowledge base, and
          run workflows.
        </p>
      </header>

      <Card>
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
            <p className="text-muted-foreground text-sm">
              No projects yet. Create one to get started.
            </p>
          ) : (
            <ul
              className="grid gap-2"
              style={{
                containIntrinsicSize: "auto 200px",
                contentVisibility: "auto",
              }}
            >
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    className="group flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                    href={`/projects/${project.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{project.name}</p>
                      <p className="truncate text-muted-foreground text-sm">
                        {project.slug}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-sm transition-colors group-hover:text-foreground">
                      Open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
