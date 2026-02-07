import { Suspense } from "react";
import { RunDetailContent } from "@/app/(app)/projects/[projectId]/runs/[runId]/run-detail-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Run detail page (stream + persisted step timeline).
 *
 * @param props - Route params.
 * @returns Run detail page.
 */
export default async function RunDetailPage(
  props: Readonly<{ params: Promise<{ projectId: string; runId: string }> }>,
) {
  const { projectId, runId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-7 w-80" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-6 w-24" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-56" />
              </div>
              <div className="md:justify-self-end">
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-6 w-20" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="mt-4 h-24 w-full" />
          </div>
        </div>
      }
    >
      <RunDetailContent params={{ projectId, runId }} />
    </Suspense>
  );
}
