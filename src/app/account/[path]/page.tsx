import { AccountView } from "@neondatabase/auth/react";
import { accountViewPaths } from "@neondatabase/auth/react/ui/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { requireAppUser } from "@/lib/auth/require-app-user";

const ALLOWED_ACCOUNT_VIEW_PATHS = [
  accountViewPaths.SETTINGS,
  accountViewPaths.SECURITY,
];
const ALLOWED_ACCOUNT_VIEW_PATH_SET = new Set(ALLOWED_ACCOUNT_VIEW_PATHS);

/**
 * Statically enumerate supported Neon Auth account views.
 *
 * @returns Route params for `/account/[path]`.
 */
export function generateStaticParams() {
  return ALLOWED_ACCOUNT_VIEW_PATHS.map((path) => ({ path }));
}

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
  await connection();
  const [{ path }] = await Promise.all([props.params, requireAppUser()]);
  if (!ALLOWED_ACCOUNT_VIEW_PATH_SET.has(path)) {
    notFound();
  }

  return (
    <main className="container mx-auto p-4 md:p-6" id="main" tabIndex={-1}>
      <AccountView path={path} />
    </main>
  );
}
