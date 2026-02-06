import { connection } from "next/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Account route layout rendered inside the authenticated application shell.
 *
 * @param props - Layout props containing nested account page content.
 * @returns Account layout wrapped in the shared app shell.
 */
export default async function AccountLayout(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  await connection();
  await requireAppUser();
  return <AppShell>{props.children}</AppShell>;
}
