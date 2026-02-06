import { authViewPaths } from "@neondatabase/auth/react/ui/server";
import { notFound } from "next/navigation";
import { AuthViewClient } from "./auth-view-client";

const ALLOWED_AUTH_VIEW_PATHS = Object.values(authViewPaths).filter(
  (path) =>
    path !== authViewPaths.SIGN_UP && path !== authViewPaths.ACCEPT_INVITATION,
);
const ALLOWED_AUTH_VIEW_PATH_SET = new Set(ALLOWED_AUTH_VIEW_PATHS);

/**
 * Statically enumerate supported Neon Auth views.
 *
 * We intentionally omit routes that would enable onboarding flows (sign-up,
 * invitations) until BYOK and public signup are explicitly enabled.
 *
 * @returns Route params for `/auth/[path]`.
 */
export function generateStaticParams() {
  return ALLOWED_AUTH_VIEW_PATHS.map((path) => ({ path }));
}

/**
 * Neon Auth UI route (e.g. /auth/sign-in).
 *
 * @param props - Next.js page props.
 * @returns The auth page UI.
 */
export default async function AuthPage(
  props: Readonly<{
    params: Promise<{ path: string }>;
  }>,
) {
  const { path } = await props.params;
  if (!ALLOWED_AUTH_VIEW_PATH_SET.has(path)) {
    notFound();
  }

  return (
    <main
      className="container mx-auto flex grow flex-col items-center justify-center p-4 md:p-6"
      id="main"
      tabIndex={-1}
    >
      <AuthViewClient path={path} />
    </main>
  );
}
