import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata/site";

/**
 * Web app manifest metadata.
 *
 * @returns The generated manifest definition.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    description: SITE_DESCRIPTION,
    display: "standalone",
    icons: [
      {
        sizes: "any",
        src: "/favicon.ico",
        type: "image/x-icon",
      },
    ],
    name: SITE_NAME,
    short_name: "Agent Builder",
    start_url: "/",
    theme_color: "#0a0a0a",
  };
}
