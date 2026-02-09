import { Suspense } from "react";

import { ReposContent } from "@/app/(app)/projects/[projectId]/repos/repos-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Repo connection tab.
 *
 * @param props - Route params.
 * @returns Repo connection UI.
 */
export default async function ReposPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <ReposContent projectId={projectId} />
    </Suspense>
  );
}
