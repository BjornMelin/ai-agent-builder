import { Suspense } from "react";
import { RunsContent } from "@/app/(app)/projects/[projectId]/runs/runs-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Runs tab (P0 list view).
 *
 * @param props - Route params.
 * @returns The runs page.
 */
export default async function RunsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      }
    >
      <RunsContent projectId={projectId} />
    </Suspense>
  );
}
