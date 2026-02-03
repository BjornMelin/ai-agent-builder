import path from "node:path";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withWorkflow(nextConfig, {
  workflows: {
    // Reduce build memory/time by scanning only our workflow definitions.
    dirs: ["src/workflows"],
  },
});
