import { Suspense } from "react";
import { ArtifactsContent } from "@/app/(app)/projects/[projectId]/artifacts/artifacts-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Artifacts tab: list latest versions by key.
 *
 * @param props - Route params.
 * @returns Artifacts page.
 */
export default async function ArtifactsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      }
    >
      <ArtifactsContent projectId={projectId} />
    </Suspense>
  );
}
