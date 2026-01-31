import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

/**
 * Metadata for the application.
 */
export const metadata: Metadata = {
  description: "Build AI-powered products, applications, and workflows",
  title: "AI Agent Builder",
};

/**
 * Viewport for the application.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { color: "#ffffff", media: "(prefers-color-scheme: light)" },
    { color: "#0a0a0a", media: "(prefers-color-scheme: dark)" },
  ],
};

/**
 * Root application layout for all routes.
 *
 * @param props - Layout props containing page content.
 * @returns The root HTML structure.
 */
export default function RootLayout(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;
  const enableAnalytics = process.env.VERCEL === "1";
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--background)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--foreground)] focus:shadow focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--foreground)_35%,transparent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
        >
          Skip to Main Content
        </a>
        <Providers>{children}</Providers>
        {enableAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
