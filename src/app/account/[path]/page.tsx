import { AccountView } from "@neondatabase/auth/react";
import { accountViewPaths } from "@neondatabase/auth/react/ui/server";

import { requireAppUser } from "@/lib/auth/access";

/**
 * Forces dynamic rendering for the account route.
 */
export const dynamic = "force-dynamic";
/**
 * Disables dynamic route params for this page.
 */
export const dynamicParams = false;

/**
 * Statically enumerate supported Neon Auth account views.
 *
 * @returns Route params for `/account/[path]`.
 */
export function generateStaticParams() {
  // Only expose the minimal account views we need right now.
  const allowed = [accountViewPaths.SETTINGS, accountViewPaths.SECURITY];
  return allowed.map((path) => ({ path }));
}

/**
 * Neon Auth account management route (e.g. /account/settings).
 *
 * @param props - Next.js page props.
 * @returns The account page UI.
 */
export default async function AccountPage(
  props: Readonly<{
    params: { path: string };
  }>,
) {
  const { path } = props.params;
  await requireAppUser();

  return (
    <main className="container mx-auto p-4 md:p-6">
      <AccountView path={path} />
    </main>
  );
}
