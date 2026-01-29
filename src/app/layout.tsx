import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description: "Build AI agents for your business",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
