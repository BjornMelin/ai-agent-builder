import { AuthView } from "@neondatabase/auth/react";
import { authViewPaths } from "@neondatabase/auth/react/ui/server";

/**
 * Disables dynamic route params for auth views.
 */
export const dynamicParams = false;

/**
 * Statically enumerate supported Neon Auth views.
 *
 * We intentionally omit routes that would enable onboarding flows (sign-up,
 * invitations) until BYOK and public signup are explicitly enabled.
 *
 * @returns Route params for `/auth/[path]`.
 */
export function generateStaticParams() {
  // We intentionally do not expose sign-up or invitation flows yet.
  // Access remains admin-provisioned + allowlisted.
  const allowed = Object.values(authViewPaths).filter(
    (path) =>
      path !== authViewPaths.SIGN_UP &&
      path !== authViewPaths.ACCEPT_INVITATION,
  );

  return allowed.map((path) => ({ path }));
}

/**
 * Neon Auth UI route (e.g. /auth/sign-in).
 *
 * @param props - Next.js page props.
 * @returns The auth page UI.
 */
export default function AuthPage(
  props: Readonly<{
    params: { path: string };
  }>,
) {
  const { path } = props.params;

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center p-4 md:p-6">
      <AuthView path={path} />
    </main>
  );
}
