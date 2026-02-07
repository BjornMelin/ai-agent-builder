import { Suspense } from "react";
import { UploadsContent } from "@/app/(app)/projects/[projectId]/uploads/uploads-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Uploads tab.
 *
 * @param props - Route params.
 * @returns The uploads page.
 */
export default async function UploadsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="rounded-xl border border-dashed bg-card p-6">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-36" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      }
    >
      <UploadsContent projectId={projectId} />
    </Suspense>
  );
}
