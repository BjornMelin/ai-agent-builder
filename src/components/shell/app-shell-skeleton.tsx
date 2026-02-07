import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Props for {@link AppShellSkeleton}. */
export type AppShellSkeletonProps = Readonly<{
  className?: string;
  titleSkeletonClassName?: string;
}>;

/**
 * Shared Suspense fallback for pages rendered inside the application shell.
 *
 * @param props - Optional class overrides for the container and title skeleton.
 * @returns Shell-aligned skeleton content used as a Suspense fallback.
 */
export function AppShellSkeleton(props: AppShellSkeletonProps) {
  const { className, titleSkeletonClassName } = props;
  return (
    <div
      aria-hidden="true"
      className={cn("flex min-h-screen bg-muted/20", className)}
    >
      <div className="hidden w-64 shrink-0 md:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="flex h-14 items-center gap-2 px-4 md:px-6">
            <Skeleton className="h-8 w-8" />
            <Skeleton className={cn("h-4 w-56", titleSkeletonClassName)} />
          </div>
        </header>
        <main className="flex flex-1 flex-col" tabIndex={-1}>
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-6 md:px-6 lg:px-8">
            <div className="space-y-4">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
