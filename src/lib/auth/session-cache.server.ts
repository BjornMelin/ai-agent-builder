import "server-only";

import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { cache } from "react";

import { getAuth } from "@/lib/auth/neon-auth.server";

type SessionResult = Awaited<
  ReturnType<ReturnType<typeof getAuth>["getSession"]>
>;

const sessionParams =
  process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ? ({ query: { disableCookieCache: "true" } } as const)
    : undefined;

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
  return await getAuth().getSession(sessionParams);
});
