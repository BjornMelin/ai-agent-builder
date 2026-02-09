import { describe, expect, it } from "vitest";

import {
  SANDBOX_NETWORK_POLICY_NONE,
  SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT,
  SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT,
} from "@/lib/sandbox/network-policy.server";

describe("sandbox network policies", () => {
  it("defines a no-access policy", () => {
    expect(SANDBOX_NETWORK_POLICY_NONE).toEqual({ type: "no-access" });
  });

  it("defines restricted policies with expected domains", () => {
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT.type).toBe("restricted");
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT.allowedDomains).toContain(
      "registry.npmjs.org",
    );
    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_DEFAULT.allowedDomains).toContain(
      "api.github.com",
    );

    expect(SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT.type).toBe(
      "restricted",
    );
    expect(
      SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT.allowedDomains,
    ).toContain("pypi.org");
    expect(
      SANDBOX_NETWORK_POLICY_RESTRICTED_PYTHON_DEFAULT.allowedDomains,
    ).toContain("files.pythonhosted.org");
  });
});
