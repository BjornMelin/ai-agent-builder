import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppAuthGate } from "@/app/(app)/app-auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { AppShellSkeleton } from "@/components/shell/app-shell-skeleton";

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
    <Suspense fallback={<AppShellSkeleton />}>
      <AppAuthGate>
        <AppShell>{children}</AppShell>
      </AppAuthGate>
    </Suspense>
  );
}
