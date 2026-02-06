import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountAuthGate } from "@/app/account/account-auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Account route layout rendered inside the authenticated application shell.
 *
 * @param props - Layout props containing nested account page content.
 * @returns Account layout wrapped in the shared app shell.
 */
export default function AccountLayout(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <AccountAuthGate>
        <AppShell>{props.children}</AppShell>
      </AccountAuthGate>
    </Suspense>
  );
}
