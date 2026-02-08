import { describe, expect, it } from "vitest";

import { isSearchScope, isSearchTypeFilter } from "@/lib/search/types";

describe("search types guards", () => {
  it("isSearchScope accepts known scopes", () => {
    expect(isSearchScope("global")).toBe(true);
    expect(isSearchScope("project")).toBe(true);
  });

  it("isSearchScope rejects unknown scopes", () => {
    expect(isSearchScope("")).toBe(false);
    expect(isSearchScope("GLOBAL")).toBe(false);
    expect(isSearchScope("foo")).toBe(false);
  });

  it("isSearchTypeFilter accepts known filters", () => {
    expect(isSearchTypeFilter("projects")).toBe(true);
    expect(isSearchTypeFilter("uploads")).toBe(true);
    expect(isSearchTypeFilter("chunks")).toBe(true);
    expect(isSearchTypeFilter("artifacts")).toBe(true);
    expect(isSearchTypeFilter("runs")).toBe(true);
  });

  it("isSearchTypeFilter rejects unknown filters", () => {
    expect(isSearchTypeFilter("")).toBe(false);
    expect(isSearchTypeFilter("Projects")).toBe(false);
    expect(isSearchTypeFilter("users")).toBe(false);
  });
});
