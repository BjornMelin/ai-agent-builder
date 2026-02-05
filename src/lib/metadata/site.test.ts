import { describe, expect, it, vi } from "vitest";

type EnvOverrides = Readonly<Record<string, string | undefined>>;

async function withEnv<T>(
  overrides: EnvOverrides,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function loadMetadataModule() {
  vi.resetModules();
  return await import("@/lib/metadata/site");
}

describe("site metadata defaults", () => {
  it("falls back to localhost when APP_BASE_URL is missing", async () => {
    await withEnv({ APP_BASE_URL: undefined }, async () => {
      const { getSiteUrl } = await loadMetadataModule();
      expect(getSiteUrl().toString()).toBe("http://localhost:3000/");
    });
  });

  it("uses APP_BASE_URL when available", async () => {
    await withEnv({ APP_BASE_URL: "https://app.example.com" }, async () => {
      const { getSiteUrl } = await loadMetadataModule();
      expect(getSiteUrl().toString()).toBe("https://app.example.com/");
    });
  });

  it("builds private, deterministic default metadata", async () => {
    await withEnv({ APP_BASE_URL: "https://app.example.com" }, async () => {
      const { getBaseMetadata } = await loadMetadataModule();
      const metadata = getBaseMetadata();

      expect(metadata.robots).toEqual({ follow: false, index: false });
      expect(metadata.alternates?.canonical).toBe("/");
      expect(metadata.metadataBase?.toString()).toBe(
        "https://app.example.com/",
      );

      const twitterCard =
        metadata.twitter && "card" in metadata.twitter
          ? metadata.twitter.card
          : undefined;
      const openGraphType =
        metadata.openGraph && "type" in metadata.openGraph
          ? metadata.openGraph.type
          : undefined;

      expect(twitterCard).toBe("summary_large_image");
      expect(openGraphType).toBe("website");
    });
  });
});
