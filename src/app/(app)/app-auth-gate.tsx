import { connection } from "next/server";
import type { ReactNode } from "react";

import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Auth + connection gate for authenticated app routes.
 *
 * @remarks
 * Cache Components mode requires uncached, request-time reads to live under a
 * Suspense boundary to avoid blocking the entire route from streaming.
 *
 * @param props - Gate props.
 * @returns Child content after the request is marked dynamic and the user is authorized.
 */
export async function AppAuthGate(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;

  // IMPORTANT: `connection()` must be awaited before any request-bound reads
  // (cookies/headers/session/redirect) so Next.js excludes subsequent work
  // from prerendering in Cache Components mode.
  await connection();
  await requireAppUser();

  return children;
}
