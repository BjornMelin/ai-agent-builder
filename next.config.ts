import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/** Base Next.js configuration for app runtime, images, and build behavior. */
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        hostname: "models.dev",
        pathname: "/logos/**",
        protocol: "https",
      },
    ],
  },
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

/** Next.js config enhanced with Workflow route/build integration. */
export default withWorkflow(nextConfig, {
  workflows: {
    // Reduce build memory/time by scanning only our workflow definitions.
    dirs: ["src/workflows"],
  },
});
