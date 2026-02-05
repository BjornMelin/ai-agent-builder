import "server-only";

import type { Metadata } from "next";
import { env } from "@/lib/env";

const FALLBACK_SITE_URL = "http://localhost:3000";

/**
 * Canonical product name used in default metadata.
 */
export const SITE_NAME = "AI Agent Builder";

/**
 * Canonical product description used in default metadata.
 */
export const SITE_DESCRIPTION =
  "Build AI-powered products, applications, and workflows.";

/**
 * Canonical product tagline used in social image branding.
 */
export const SITE_TAGLINE = "Build AI-powered products and workflows.";

/**
 * Robots defaults for private, authenticated routes.
 */
export const PRIVATE_ROBOTS: Metadata["robots"] = {
  follow: false,
  index: false,
};

/**
 * Returns the base site URL for metadata generation.
 *
 * @returns Parsed URL from `APP_BASE_URL`, or localhost fallback in local/test contexts.
 */
export function getSiteUrl(): URL {
  try {
    return new URL(env.app.baseUrl);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}

/**
 * Returns app-wide default metadata.
 *
 * @returns Baseline metadata for title, canonical URL, robots, and social cards.
 */
export function getBaseMetadata(): Metadata {
  const siteUrl = getSiteUrl();

  return {
    alternates: {
      canonical: "/",
    },
    applicationName: SITE_NAME,
    description: SITE_DESCRIPTION,
    icons: {
      icon: [{ sizes: "any", type: "image/x-icon", url: "/favicon.ico" }],
    },
    manifest: "/manifest.webmanifest",
    metadataBase: siteUrl,
    openGraph: {
      description: SITE_DESCRIPTION,
      images: [
        {
          alt: `${SITE_NAME} Open Graph preview`,
          height: 630,
          url: "/opengraph-image",
          width: 1200,
        },
      ],
      siteName: SITE_NAME,
      title: SITE_NAME,
      type: "website",
      url: siteUrl,
    },
    robots: PRIVATE_ROBOTS,
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    twitter: {
      card: "summary_large_image",
      description: SITE_DESCRIPTION,
      images: ["/twitter-image"],
      title: SITE_NAME,
    },
  };
}
