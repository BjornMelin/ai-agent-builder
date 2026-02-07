import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountAuthGate } from "@/app/account/account-auth-gate";
import { AppShell } from "@/components/shell/app-shell";
import { AppShellSkeleton } from "@/components/shell/app-shell-skeleton";

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
    <Suspense fallback={<AppShellSkeleton titleSkeletonClassName="w-40" />}>
      <AccountAuthGate>
        <AppShell>{props.children}</AppShell>
      </AccountAuthGate>
    </Suspense>
  );
}
