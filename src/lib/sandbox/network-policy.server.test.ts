import { describe, expect, it } from "vitest";

import {
  SANDBOX_NETWORK_POLICY_NONE,
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";

describe("sandbox network policies", () => {
  it("defines a no-access policy", () => {
    expect(SANDBOX_NETWORK_POLICY_NONE).toBe("deny-all");
  });

  it("defines restricted policies with expected domains", () => {
    if (typeof SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT === "string") {
      throw new Error("Expected restricted default policy object");
    }
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT.allow).toContain(
      "registry.npmjs.org",
    );
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT.allow).toContain(
      "api.github.com",
    );

    if (typeof SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT === "string") {
      throw new Error("Expected restricted python policy object");
    }
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT.allow).toContain(
      "pypi.org",
    );
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT.allow).toContain(
      "files.pythonhosted.org",
    );
  });
});
