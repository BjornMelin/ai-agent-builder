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
        <div className="grid gap-4 lg:grid-cols-2">
          {["a", "b", "c", "d"].map((key) => (
            <div className="rounded-xl border bg-card p-6" key={key}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-8 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-8 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
              <div className="mt-4 flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
      }
    >
      <ProjectOverviewContent projectId={projectId} />
    </Suspense>
  );
}
