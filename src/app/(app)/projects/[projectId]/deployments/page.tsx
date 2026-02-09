import { Suspense } from "react";

import { DeploymentsContent } from "@/app/(app)/projects/[projectId]/deployments/deployments-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Deployments tab.
 *
 * @param props - Route params.
 * @returns Deployments UI.
 */
export default async function DeploymentsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <DeploymentsContent projectId={projectId} />
    </Suspense>
  );
}
