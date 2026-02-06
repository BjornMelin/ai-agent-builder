import { Suspense } from "react";
import { ProjectsContent } from "@/app/(app)/projects/projects-content";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Project list page.
 *
 * @param props - Next.js page props including optional `searchParams.limit`.
 * @returns A projects dashboard with create and recent-project sections.
 */
export default async function ProjectsPage(
  props: Readonly<{
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }>,
) {
  const searchParams = await props.searchParams;
  const rawLimit = searchParams.limit;
  const parsedLimit =
    typeof rawLimit === "string" ? Number.parseInt(rawLimit, 10) : undefined;
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="rounded-xl border border-dashed bg-card p-6">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-44" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      }
    >
      <ProjectsContent {...(limit === undefined ? {} : { limit })} />
    </Suspense>
  );
}
