import { Skeleton } from "@/components/ui/skeleton";

/**
 * Upload detail loading UI.
 *
 * @returns Loading skeleton for upload detail routes.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-4">
          <Skeleton className="h-6 w-72" />

          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-44" />
          </div>

          <Skeleton className="h-px w-full" />

          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-full" />
          </div>

          <Skeleton className="h-px w-full" />

          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>

      <Skeleton className="h-4 w-32" />
    </div>
  );
}
