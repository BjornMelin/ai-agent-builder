import { authViewPaths } from "@neondatabase/auth/react/ui/server";
import { notFound } from "next/navigation";
import { NeonAuthUiProvider } from "@/app/_auth/neon-auth-ui-provider";
import { AuthViewClient } from "./auth-view-client";

const ALLOWED_AUTH_VIEW_PATHS = [
  authViewPaths.SIGN_IN,
  authViewPaths.FORGOT_PASSWORD,
  authViewPaths.MAGIC_LINK,
  authViewPaths.EMAIL_OTP,
  authViewPaths.TWO_FACTOR,
  authViewPaths.RECOVER_ACCOUNT,
  authViewPaths.RESET_PASSWORD,
  authViewPaths.CALLBACK,
  authViewPaths.SIGN_OUT,
] as const;
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
  // `dynamicParams = false` is not compatible with Cache Components, so keep a
  // runtime allowlist guard as defense-in-depth.
  if (!ALLOWED_AUTH_VIEW_PATH_SET.has(path)) {
    notFound();
  }

  return (
    <NeonAuthUiProvider>
      <main
        className="container mx-auto flex grow flex-col items-center justify-center p-4 md:p-6"
        id="main"
        tabIndex={-1}
      >
        <AuthViewClient path={path} />
      </main>
    </NeonAuthUiProvider>
  );
}
