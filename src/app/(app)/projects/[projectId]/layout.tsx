import { type ReactNode, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ProjectLayoutInner } from "./project-layout-inner";

/**
 * Project-scoped layout: header + tabs.
 *
 * @param props - Layout props.
 * @returns The project layout.
 */
export default async function ProjectLayout(
  props: Readonly<{
    children: ReactNode;
    params: Promise<{ projectId: string }>;
  }>,
) {
  const { children } = props;
  const { projectId } = await props.params;

  return (
    <Suspense
      fallback={
        <div className="flex flex-1 flex-col gap-5">
          <div className="rounded-2xl border bg-card p-4 md:p-6">
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-4 w-44" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <ProjectLayoutInner projectId={projectId}>{children}</ProjectLayoutInner>
    </Suspense>
  );
}
