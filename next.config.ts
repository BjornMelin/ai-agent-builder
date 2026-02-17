import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const workflowExcludeNodeModulesRule = {
  condition: { all: [{ not: { path: /[/\\]node_modules[/\\]/ } }] },
  loaders: [],
} satisfies NonNullable<NonNullable<NextConfig["turbopack"]>["rules"]>[string];

/** Base Next.js configuration for app runtime, images, and build behavior. */
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ["radix-ui", "lucide-react"],
    // Keep build filesystem cache explicitly disabled until we gather stable
    // CI/Vercel benchmark data for this project.
    turbopackFileSystemCacheForBuild: false,
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
      {
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
        protocol: "https",
        search: "",
      },
    ],
  },
  // Ensure repo-bundled skill markdown is available in serverless traces.
  // See docs/architecture/spec/SPEC-0027-agent-skills-runtime-integration.md.
  outputFileTracingIncludes: {
    "/*": [".agents/skills/**/*", ".codex/skills/**/*"],
  },
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.cjs": workflowExcludeNodeModulesRule,
      "*.cts": workflowExcludeNodeModulesRule,
      "*.js": workflowExcludeNodeModulesRule,
      "*.jsx": workflowExcludeNodeModulesRule,
      "*.mjs": workflowExcludeNodeModulesRule,
      "*.mts": workflowExcludeNodeModulesRule,
      "*.ts": workflowExcludeNodeModulesRule,
      "*.tsx": workflowExcludeNodeModulesRule,
    },
  },
  webpack: (config) => {
    if (config.module?.rules) {
      config.module.rules = config.module.rules.filter((rule: unknown) => {
        if (
          typeof rule === "object" &&
          rule !== null &&
          "loader" in rule &&
          typeof rule.loader === "string" &&
          rule.loader.includes("@workflow/next/dist/loader")
        ) {
          return false;
        }
        return true;
      });
    }
    return config;
  },
};

/** Next.js config enhanced with Workflow route/build integration. */
export default withWorkflow(nextConfig);
