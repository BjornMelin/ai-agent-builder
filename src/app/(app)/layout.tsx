import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppAuthGate } from "@/app/(app)/app-auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Authenticated application layout.
 *
 * @param props - Layout props containing child routes.
 * @returns Unified application shell for authenticated routes.
 */
export default function AppLayout(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;

  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <AppAuthGate>
        <AppShell>{children}</AppShell>
      </AppAuthGate>
    </Suspense>
  );
}
