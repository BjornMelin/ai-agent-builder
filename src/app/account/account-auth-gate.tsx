import { connection } from "next/server";
import type { ReactNode } from "react";

import { requireAppUser } from "@/lib/auth/require-app-user";

/**
 * Auth + connection gate for `/account/*` routes.
 *
 * @remarks
 * Cache Components mode requires uncached, request-time reads to live under a
 * Suspense boundary to avoid blocking the whole route from streaming.
 *
 * @param props - Gate props.
 * @returns Child content after the request is marked dynamic and the user is authorized.
 */
export async function AccountAuthGate(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;

  await connection();
  await requireAppUser();

  return children;
}
