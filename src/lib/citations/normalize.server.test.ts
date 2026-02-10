import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/budgets.server", () => ({
  budgets: {
    maxCitationsPerArtifact: 2,
  },
}));

describe("normalizeWebCitations", () => {
  it("dedupes by URL and assigns stable 1-based indices in insertion order", async () => {
    const { normalizeWebCitations } = await import("./normalize.server");

    const citations = normalizeWebCitations([
      {
        description: null,
        title: "First A",
        url: "https://example.com/a",
      },
      {
        description: null,
        title: "First B",
        url: "https://example.com/b",
      },
      {
        description: null,
        title: "Second A",
        url: "https://example.com/a",
      },
    ]);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.sourceType).toBe("web");
    expect(citations[0]?.sourceRef).toBe("https://example.com/a");
    expect(citations[0]?.payload).toMatchObject({
      index: 1,
      title: "First A",
      url: "https://example.com/a",
    });
    expect(citations[1]?.sourceRef).toBe("https://example.com/b");
    expect(citations[1]?.payload).toMatchObject({
      index: 2,
      title: "First B",
      url: "https://example.com/b",
    });
  });

  it("respects options.maxCitations and clamps to budgets", async () => {
    const { normalizeWebCitations } = await import("./normalize.server");

    const sources = [
      { description: null, title: "A", url: "https://example.com/a" },
      { description: null, title: "B", url: "https://example.com/b" },
      { description: null, title: "C", url: "https://example.com/c" },
    ] as const;

    expect(normalizeWebCitations(sources, { maxCitations: 1 })).toHaveLength(1);
    expect(normalizeWebCitations(sources, { maxCitations: 10 })).toHaveLength(
      2,
    );
    expect(normalizeWebCitations(sources, { maxCitations: 0 })).toHaveLength(1);
  });

  it("rejects non-http(s) URLs by throwing", async () => {
    const { normalizeWebCitations } = await import("./normalize.server");

    expect(() =>
      normalizeWebCitations([
        {
          description: null,
          title: "Unsafe",
          url: "file:///etc/passwd",
        },
      ]),
    ).toThrow(/Unsupported URL protocol/i);

    expect(() =>
      normalizeWebCitations([
        {
          description: null,
          title: "Unsafe",
          url: "javascript:alert(1)",
        },
      ]),
    ).toThrow(/Unsupported URL protocol/i);
  });

  it("trims URLs and normalizes persisted url/sourceRef", async () => {
    const { normalizeWebCitations } = await import("./normalize.server");

    const citations = normalizeWebCitations([
      {
        description: null,
        title: "Trimmed",
        url: " https://example.com/trim ",
      },
    ]);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.sourceRef).toBe("https://example.com/trim");
    expect(citations[0]?.payload).toMatchObject({
      url: "https://example.com/trim",
    });
  });
});
