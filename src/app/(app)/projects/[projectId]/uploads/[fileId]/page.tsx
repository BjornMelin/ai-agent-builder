import { Suspense } from "react";
import { UploadDetailContent } from "@/app/(app)/projects/[projectId]/uploads/[fileId]/upload-detail-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Single upload details page (P0).
 *
 * @param props - Route params.
 * @returns The upload detail page.
 */
export default async function UploadDetailPage(
  props: Readonly<{ params: Promise<{ fileId: string; projectId: string }> }>,
) {
  const { projectId, fileId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-72" />
            <div className="mt-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-full" />
            </div>
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
      }
    >
      <UploadDetailContent fileId={fileId} projectId={projectId} />
    </Suspense>
  );
}
