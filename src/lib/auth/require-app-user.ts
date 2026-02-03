import "server-only";

import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth/neon-auth.server";
import { env, normalizeEmail } from "@/lib/env";

/**
 * Enforces that the current request has an authenticated and allowed user.
 *
 * This is app-level access control (cost control): even if a user can authenticate
 * via Neon Auth (e.g., GitHub/Vercel OAuth), the app can still deny access unless
 * they are explicitly allowlisted.
 *
 * @returns Session user object from Neon Auth.
 */
export async function requireAppUser() {
  const { data: session } = await getAuth().getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  if (env.auth.accessMode === "open") {
    return session.user;
  }

  const email = session.user.email ? normalizeEmail(session.user.email) : "";
  if (email.length === 0 || !env.auth.allowedEmails.includes(email)) {
    const redirectTo = encodeURIComponent("/auth/denied");
    redirect(`/auth/sign-out?redirectTo=${redirectTo}`);
  }

  return session.user;
}
