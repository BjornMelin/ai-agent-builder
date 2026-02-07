"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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

  return (
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
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
