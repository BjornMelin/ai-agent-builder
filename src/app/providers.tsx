"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth/neon-auth.client";
import { parseAuthSocialProviders } from "@/lib/auth/social-providers";

/**
 * Client-side providers wrapper (keeps `app/layout.tsx` as a Server Component).
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
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
        storageKey="ai-agent-builder-theme"
      >
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:z-50 focus-visible:bg-background focus-visible:p-2"
        >
          Skip to content
        </a>
        <Suspense
          fallback={<div aria-hidden="true" className="min-h-[240px] w-full" />}
        >
          {children}
        </Suspense>
        <Toaster richColors />
      </ThemeProvider>
    </NeonAuthUIProvider>
  );
}
