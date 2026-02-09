import "server-only";

import type { NetworkPolicy } from "@vercel/sandbox";

export const SANDBOX_NETWORK_POLICY_NONE: NetworkPolicy = { type: "no-access" };

export const SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT: NetworkPolicy = {
  allowedDomains: [
    "*.github.com",
    "*.githubusercontent.com",
    "*.npmjs.org",
    "api.github.com",
    "codeload.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "registry.npmjs.org",
  ],
  type: "restricted",
};
