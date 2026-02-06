import { AccountView } from "@neondatabase/auth/react";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { NeonAuthUiProvider } from "@/app/_auth/neon-auth-ui-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccountRoute } from "@/lib/navigation/account-routes";

/**
 * Neon Auth account management route (e.g. /account/settings).
 *
 * @param props - Next.js page props.
 * @returns The account page UI.
 */
export default async function AccountPage(
  props: Readonly<{
    params: Promise<{ path: string }>;
  }>,
) {
  const { path } = await props.params;
  const accountRoute = getAccountRoute(path);
  if (!accountRoute) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl space-y-3 rounded-2xl border bg-card/60 p-4 md:p-6">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <NeonAuthUiProvider>
        <div className="mx-auto w-full max-w-4xl rounded-2xl border bg-card/60 p-4 md:p-6">
          <AccountView path={accountRoute.segment} />
        </div>
      </NeonAuthUiProvider>
    </Suspense>
  );
}
