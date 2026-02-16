import "server-only";

import type { NetworkPolicy } from "@vercel/sandbox";

export const SANDBOX_NETWORK_POLICY_NONE: NetworkPolicy = "deny-all";

export const SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT: NetworkPolicy = {
  allow: [
    "*.github.com",
    "*.githubusercontent.com",
    "*.npmjs.org",
    "api.github.com",
    "codeload.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "registry.npmjs.org",
  ],
};

export const SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT: NetworkPolicy = {
  allow: [
    "*.github.com",
    "*.githubusercontent.com",
    "api.github.com",
    "codeload.github.com",
    "files.pythonhosted.org",
    "github.com",
    "pypi.org",
    "raw.githubusercontent.com",
  ],
};
