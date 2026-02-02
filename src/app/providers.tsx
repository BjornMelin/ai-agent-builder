"use client";

import { NeonAuthUIProvider, UserButton } from "@neondatabase/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth/neon-auth.client";

type AuthSocialProvider = "github" | "vercel";

/**
 * Client-side providers wrapper (keeps `app/layout.tsx` as a Server Component).
 *
 * Neon Auth UI is configured to:
 * - Allow sign-in via GitHub + Vercel OAuth
 * - Allow password sign-in for existing users (sign-up UI is disabled)
 * - Support "forgot password" for admin-provisioned email accounts
 *
 * @param props - Provider props.
 * @returns Provider-wrapped children.
 */
export function Providers(
  props: Readonly<{
    children: ReactNode;
    authSocialProviders: ReadonlyArray<AuthSocialProvider>;
  }>,
) {
  const { children, authSocialProviders } = props;
  const router = useRouter();

  const socialProviders = Array.from(authSocialProviders);
  const socialProps =
    socialProviders.length > 0
      ? { social: { providers: socialProviders } }
      : {};

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      redirectTo="/account/settings"
      signUp={false}
      {...socialProps}
      credentials={{ forgotPassword: true }}
      Link={Link}
    >
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-2"
        >
          Skip to content
        </a>
        <header className="flex h-16 items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="font-semibold tracking-tight hover:opacity-80"
          >
            AI Agent Builder
          </Link>
          <UserButton size="icon" />
        </header>
        <div id="main" tabIndex={-1} className="flex-1">
          {children}
        </div>
      </div>
    </NeonAuthUIProvider>
  );
}
