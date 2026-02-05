import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata/site";

/**
 * Alt text for the generated Open Graph image.
 */
export const alt = `${SITE_NAME} preview image`;

/**
 * Dimensions for the generated Open Graph image.
 */
export const size = {
  height: 630,
  width: 1200,
};

/**
 * MIME type for the generated Open Graph image.
 */
export const contentType = "image/png";

/**
 * Generates the default Open Graph image for the application.
 *
 * @returns Generated Open Graph image response.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background:
          "radial-gradient(circle at 20% 20%, #dbeafe 0%, #ffffff 45%, #f5f3ff 100%)",
        color: "#0f172a",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {SITE_NAME}
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.1,
          maxWidth: 1000,
        }}
      >
        Build AI-powered products and workflows.
      </div>
      <div
        style={{
          color: "#334155",
          fontSize: 30,
          lineHeight: 1.4,
          maxWidth: 960,
        }}
      >
        {SITE_DESCRIPTION}
      </div>
    </div>,
    size,
  );
}
