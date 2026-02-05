import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/metadata/site";

/**
 * Alt text for the generated Twitter card image.
 */
export const alt = `${SITE_NAME} Twitter card`;

/**
 * Dimensions for the generated Twitter card image.
 */
export const size = {
  height: 630,
  width: 1200,
};

/**
 * MIME type for the generated Twitter image.
 */
export const contentType = "image/png";

/**
 * Generates the default Twitter card image for the application.
 *
 * @returns Generated Twitter image response.
 */
export default function TwitterImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #334155 100%)",
        color: "#f8fafc",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxWidth: 980,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            color: "#cbd5e1",
            fontSize: 34,
            lineHeight: 1.3,
          }}
        >
          Build AI-powered products, applications, and workflows.
        </div>
      </div>
    </div>,
    size,
  );
}
