import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  description: "Build AI-powered products, applications, and workflows",
  title: "AI Agent Builder",
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
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Analytics mode="production" />
      </body>
    </html>
  );
}
