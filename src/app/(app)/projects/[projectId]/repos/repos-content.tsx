import Link from "next/link";
import { notFound } from "next/navigation";

import { RepoConnectClient } from "@/app/(app)/projects/[projectId]/repos/repo-connect-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getProjectByIdForUser } from "@/lib/data/projects.server";
import { listReposByProject } from "@/lib/data/repos.server";

/**
 * Repo connection tab content (suspends for request-time data).
 *
 * @param props - Content props.
 * @returns Repo list + connect form.
 */
export async function ReposContent(props: Readonly<{ projectId: string }>) {
  const user = await requireAppUser();
  const project = await getProjectByIdForUser(props.projectId, user.id);
  if (!project) notFound();

  const repos = await listReposByProject(project.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Repository</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RepoConnectClient initialRepos={repos} projectId={project.id} />

          {repos.length === 0 ? (
            <Empty className="min-h-[160px] rounded-xl border">
              <EmptyHeader>
                <EmptyTitle>No repo connected</EmptyTitle>
                <EmptyDescription>
                  Connect a GitHub repository to enable implementation runs.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="grid gap-2">
              {repos.map((repo) => (
                <li key={repo.id}>
                  <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
                    <p className="truncate font-medium">
                      {repo.owner}/{repo.name}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Default branch:{" "}
                      <span className="font-medium">{repo.defaultBranch}</span>
                    </p>
                    <div className="flex min-w-0 items-center gap-3 text-sm">
                      <Link
                        className="shrink-0 rounded-xs underline-offset-4 hover:underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        href={repo.htmlUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open on GitHub
                      </Link>
                      <span className="shrink-0 text-muted-foreground">·</span>
                      <span
                        className="min-w-0 flex-1 truncate text-muted-foreground"
                        title={repo.cloneUrl}
                      >
                        {repo.cloneUrl}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
