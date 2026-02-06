import { Skeleton } from "@/components/ui/skeleton";

/**
 * Artifact detail loading UI.
 *
 * @returns Loading skeleton for artifact detail routes.
 */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-6 w-72" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
            <Skeleton className="h-9 w-16" key={idx} />
          ))}
        </div>
      </div>

      <Skeleton className="h-px w-full" />

      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton list
            <div className="rounded-md border bg-card px-3 py-2" key={idx}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
