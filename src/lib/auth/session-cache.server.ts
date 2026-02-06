import "server-only";

import { cache } from "react";

import { getAuth } from "@/lib/auth/neon-auth.server";

type SessionResult = Awaited<
  ReturnType<ReturnType<typeof getAuth>["getSession"]>
>;

/**
 * Get the current request session (deduped per request).
 *
 * @remarks
 * Some routes call `requireAppUser()` in multiple nested layouts/pages. This
 * helper ensures we only resolve the Neon Auth session once per request.
 *
 * This uses React's `cache()` API, which is request-scoped in the Next.js
 * Server Component tree.
 *
 * @returns The Neon Auth session result.
 */
export const getSessionCached = cache(async (): Promise<SessionResult> => {
  return await getAuth().getSession();
});
