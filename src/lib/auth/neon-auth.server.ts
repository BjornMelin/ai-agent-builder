import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

import { env } from "@/lib/env";

type NeonAuthServer = ReturnType<typeof createNeonAuth>;

let cachedAuth: NeonAuthServer | undefined;

/**
 * Get the Neon Auth server instance.
 *
 * This is intentionally lazy: we avoid reading auth env vars at build time
 * (Next.js evaluates route modules during `next build`).
 *
 * @returns Neon Auth server instance.
 */
export function getAuth(): NeonAuthServer {
  cachedAuth ??= createNeonAuth({
    baseUrl: env.auth.baseUrl,
    cookies: {
      secret: env.auth.cookieSecret,
      ...(env.auth.cookieDomain ? { domain: env.auth.cookieDomain } : {}),
    },
  });

  return cachedAuth;
}
