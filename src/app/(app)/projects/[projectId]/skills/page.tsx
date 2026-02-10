import { Suspense } from "react";

import { SkillsContent } from "@/app/(app)/projects/[projectId]/skills/skills-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders the project's skills management page (Installed + Registry).
 *
 * @param props - Route params containing the target projectId for this page.
 * @returns Skills UI.
 */
export default async function SkillsPage(
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
      <SkillsContent projectId={projectId} />
    </Suspense>
  );
}
