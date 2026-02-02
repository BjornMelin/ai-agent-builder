"use client";

import { AuthView } from "@neondatabase/auth/react";
import { ClientOnly } from "@/components/client-only";

/**
 * Client-only wrapper for Neon Auth UI to avoid hydration mismatches.
 *
 * @param props - Auth view props.
 * @returns The client-rendered auth view.
 */
export function AuthViewClient(
  props: Readonly<{
    path: string;
  }>,
) {
  const { path } = props;

  return (
    <ClientOnly>
      <AuthView path={path} />
    </ClientOnly>
  );
}
