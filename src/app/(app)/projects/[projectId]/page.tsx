import { Suspense } from "react";
import { ProjectOverviewContent } from "@/app/(app)/projects/[projectId]/project-overview-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Project overview page.
 *
 * @param props - Route params.
 * @returns The project overview UI.
 */
export default async function ProjectOverviewPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="mt-4 h-9 w-16" />
            <Skeleton className="mt-2 h-4 w-44" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="mt-4 h-9 w-16" />
            <Skeleton className="mt-2 h-4 w-40" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="mt-4 h-4 w-56" />
            <Skeleton className="mt-2 h-4 w-44" />
          </div>
        </div>
      }
    >
      <ProjectOverviewContent projectId={projectId} />
    </Suspense>
  );
}
