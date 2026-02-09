import { Suspense } from "react";

import { ApprovalsContent } from "@/app/(app)/projects/[projectId]/approvals/approvals-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Approvals tab.
 *
 * @param props - Route params.
 * @returns Approvals UI.
 */
export default async function ApprovalsPage(
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
      <ApprovalsContent projectId={projectId} />
    </Suspense>
  );
}
