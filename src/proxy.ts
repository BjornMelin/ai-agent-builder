import type { NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/neon-auth.server";

type NeonAuthMiddleware = ReturnType<ReturnType<typeof getAuth>["middleware"]>;

let cachedMiddleware: NeonAuthMiddleware | undefined;

/**
 * Next.js request proxy for Neon Auth.
 *
 * @param request - Incoming request.
 * @returns Response from Neon Auth middleware (redirects if unauthenticated).
 */
export default async function proxy(request: NextRequest) {
  cachedMiddleware ??= getAuth().middleware({
    loginUrl: "/auth/sign-in",
  });

  return cachedMiddleware(request);
}

/**
 * Next.js middleware matcher configuration.
 */
export const config = {
  matcher: [
    // Protect all app routes except:
    // - static assets / internals
    // - auth UI routes
    // - the Neon Auth API proxy
    "/((?!_next|_vercel|favicon.ico|auth|api/auth).*)",
  ],
};
