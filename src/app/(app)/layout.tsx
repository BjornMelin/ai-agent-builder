import Link from "next/link";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";

import { AppNavClient } from "@/app/(app)/app-nav-client";
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
  await connection();
  await requireAppUser();

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            className="font-semibold text-sm tracking-wide"
            href="/projects"
          >
            AI Agent Builder
          </Link>
          <Suspense fallback={<div aria-hidden="true" className="h-9 w-36" />}>
            <AppNavClient />
          </Suspense>
        </div>
      </header>

      <main
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-12 md:px-6"
        id="main"
        tabIndex={-1}
      >
        {children}
      </main>
    </>
  );
}
