import { Skeleton } from "@/components/ui/skeleton";

const RUN_EVENT_SKELETON_KEYS = ["a", "b", "c", "d"] as const;

/**
 * Run detail loading UI.
 *
 * @returns Loading skeleton for run detail routes.
 */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-4 w-24" />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-4">
          <Skeleton className="h-5 w-20" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="space-y-2 md:justify-self-end">
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-4">
          <Skeleton className="h-5 w-14" />
          <div className="grid gap-2">
            {RUN_EVENT_SKELETON_KEYS.map((key) => (
              <div
                className="flex items-center justify-between gap-3"
                key={key}
              >
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-44" />
                </div>
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
