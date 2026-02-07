import { describe, expect, it } from "vitest";

import { resolveShellBreadcrumbs } from "@/components/shell/breadcrumbs";

describe("resolveShellBreadcrumbs (account)", () => {
  it("never links account breadcrumbs to /account", () => {
    const accountCrumbs = resolveShellBreadcrumbs("/account");
    const settingsCrumbs = resolveShellBreadcrumbs("/account/settings");
    const securityCrumbs = resolveShellBreadcrumbs("/account/security");

    for (const crumbs of [accountCrumbs, settingsCrumbs, securityCrumbs]) {
      expect(crumbs.some((crumb) => crumb.href === "/account")).toBe(false);
    }
  });

  it("uses /account/settings as the canonical Account breadcrumb", () => {
    expect(resolveShellBreadcrumbs("/account")).toEqual([
      { href: "/account/settings", label: "Account" },
    ]);
    expect(resolveShellBreadcrumbs("/account/settings")).toEqual([
      { href: "/account/settings", label: "Account" },
    ]);
  });

  it("keeps Security page breadcrumbs valid", () => {
    expect(resolveShellBreadcrumbs("/account/security")).toEqual([
      { href: "/account/settings", label: "Account" },
      { href: "/account/security", label: "Security" },
    ]);
  });
});
