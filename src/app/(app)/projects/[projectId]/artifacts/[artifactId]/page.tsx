import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ArtifactDetailContent } from "./artifact-detail-content";

/**
 * Artifact detail page: render markdown + citations and link to other versions.
 *
 * @param props - Route params.
 * @returns Artifact detail page.
 */
export default async function ArtifactDetailPage(
  props: Readonly<{
    params: Promise<{ projectId: string; artifactId: string }>;
  }>,
) {
  const { projectId, artifactId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="grid gap-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-80" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-48 w-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-9 w-14" />
            </div>
          </div>
          <Skeleton className="h-px w-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      }
    >
      <ArtifactDetailContent artifactId={artifactId} projectId={projectId} />
    </Suspense>
  );
}
