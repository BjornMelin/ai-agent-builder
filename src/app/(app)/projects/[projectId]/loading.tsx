import { Skeleton } from "@/components/ui/skeleton";

/**
 * Project route loading UI.
 *
 * @returns Loading skeleton for project routes to enable partial prefetching.
 */
export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-3">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
    </div>
  );
}
