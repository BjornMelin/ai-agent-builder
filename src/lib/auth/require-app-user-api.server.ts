import "server-only";

import { getAuth } from "@/lib/auth/neon-auth.server";
import { AppError } from "@/lib/core/errors";
import { env, normalizeEmail } from "@/lib/env";

/**
 * Enforces that the current request has an authenticated and allowed user.
 *
 * Use this in Route Handlers where redirects are not appropriate.
 *
 * @returns Session user object from Neon Auth.
 * @throws AppError - With status 401 when the user is not authenticated.
 * @throws AppError - With status 403 when the authenticated user is not in the allowlist.
 */
export async function requireAppUserApi() {
  const { data: session } = await getAuth().getSession();

  if (!session?.user) {
    throw new AppError("unauthorized", 401, "Unauthorized.");
  }

  if (env.auth.accessMode === "open") {
    return session.user;
  }

  const email = session.user.email ? normalizeEmail(session.user.email) : "";
  if (email.length === 0 || !env.auth.allowedEmails.includes(email)) {
    throw new AppError("forbidden", 403, "Forbidden.");
  }

  return session.user;
}
