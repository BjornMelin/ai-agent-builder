import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata/site";

/**
 * Robots policy for the app.
 *
 * @returns A restrictive robots policy for this authenticated product.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    host: siteUrl.origin,
    rules: {
      disallow: "/",
      userAgent: "*",
    },
  };
}
