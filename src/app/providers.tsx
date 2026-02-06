"use client";

import { NeonAuthUIProvider, UserButton } from "@neondatabase/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ClientOnly } from "@/components/client-only";
import { authClient } from "@/lib/auth/neon-auth.client";
import { parseAuthSocialProviders } from "@/lib/auth/social-providers";

/**
 * Client-side providers wrapper (keeps `app/layout.tsx` as a Server Component).
 *
 * Neon Auth UI is configured to:
 * - Allow sign-in via GitHub + Vercel OAuth (configurable)
 * - Allow password sign-in for existing users (sign-up UI is disabled)
 * - Support "forgot password" for admin-provisioned email accounts
 *
 * @param props - Provider props.
 * @returns Provider-wrapped children.
 */
export function Providers(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;
  const router = useRouter();

  const socialProviders = Array.from(
    parseAuthSocialProviders(process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS),
  );
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
      redirectTo="/projects"
      signUp={false}
      {...socialProps}
      credentials={{ forgotPassword: true }}
      Link={Link}
    >
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:bg-background focus-visible:p-2"
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
          <ClientOnly fallback={<div aria-hidden="true" className="h-9 w-9" />}>
            <UserButton aria-label="User menu" size="icon" />
          </ClientOnly>
        </header>
        <div className="flex-1">
          <Suspense
            fallback={
              <div aria-hidden="true" className="min-h-[240px] w-full" />
            }
          >
            {children}
          </Suspense>
        </div>
      </div>
    </NeonAuthUIProvider>
  );
}
