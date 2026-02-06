import type { ReactNode } from "react";
import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Authenticated application layout.
 *
 * @param props - Layout props containing child routes.
 * @returns Application shell for authenticated routes.
 */
export default async function AppLayout(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;
  await requireAppUser();

  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 md:px-6"
      id="main"
      tabIndex={-1}
    >
      {children}
    </main>
  );
}
