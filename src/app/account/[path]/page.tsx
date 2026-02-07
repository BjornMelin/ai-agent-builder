import { AccountView } from "@neondatabase/auth/react";
import { notFound } from "next/navigation";

import { NeonAuthUiProvider } from "@/app/_auth/neon-auth-ui-provider";
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
    <NeonAuthUiProvider>
      <div className="mx-auto w-full max-w-4xl rounded-2xl border bg-card/60 p-4 md:p-6">
        <AccountView path={accountRoute.segment} />
      </div>
    </NeonAuthUiProvider>
  );
}
