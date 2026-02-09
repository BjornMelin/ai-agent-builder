import { Suspense } from "react";

import { CodeModeContent } from "@/app/(app)/projects/[projectId]/code-mode/code-mode-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Code Mode tab.
 *
 * @param props - Route params.
 * @returns Code Mode UI.
 */
export default async function CodeModePage(
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
      <CodeModeContent projectId={projectId} />
    </Suspense>
  );
}
