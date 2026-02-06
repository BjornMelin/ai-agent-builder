"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth/neon-auth.client";
import { parseAuthSocialProviders } from "@/lib/auth/social-providers";

/**
 * Neon Auth UI provider wrapper.
 *
 * @remarks
 * Keep this provider scoped to routes that render Neon Auth UI (`/auth/*`, `/account/*`)
 * to avoid shipping Neon UI code in the default authenticated app shell bundle.
 *
 * @param props - Provider props.
 * @returns Provider-wrapped children.
 */
export function NeonAuthUiProvider(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;
  const router = useRouter();

  const socialProviders = [
    ...parseAuthSocialProviders(process.env.NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS),
  ];

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
      {children}
    </NeonAuthUIProvider>
  );
}
