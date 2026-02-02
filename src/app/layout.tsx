import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { env } from "@/lib/env";
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
  const enableAnalytics = env.runtime.isVercel;
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        {enableAnalytics ? <Analytics /> : null}
      </body>
    </html>
  );
}
