import "server-only";

import { createHash } from "node:crypto";

/**
 * Deterministic manual fallback artifact used when a provider API is not configured.
 */
export type ManualFallbackArtifact = Readonly<{
  kind: "manual_fallback";
  provider: "neon" | "upstash" | "vercel";
  title: string;
  resourceNameHint: string;
  steps: readonly string[];
}>;

function stableSuffix(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 10);
}

/**
 * Build a deterministic, human-friendly resource name hint.
 *
 * @param input - Naming inputs.
 * @returns Resource name hint (ASCII, URL-safe).
 */
export function buildResourceNameHint(
  input: Readonly<{ prefix: string; projectSlug: string; runId: string }>,
): string {
  const prefix = input.prefix
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-");
  const slug = input.projectSlug
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, "-");
  const suffix = stableSuffix(`${slug}:${input.runId}`);
  const parts = [prefix, slug, suffix].filter((p) => p.length > 0);
  return parts.join("-").replaceAll(/-+/g, "-").slice(0, 64);
}

/**
 * Create a deterministic manual fallback artifact.
 *
 * @param input - Fallback artifact inputs.
 * @returns Manual fallback artifact.
 */
export function createManualFallbackArtifact(
  input: Readonly<{
    provider: ManualFallbackArtifact["provider"];
    title: string;
    resourceNameHint: string;
    steps: readonly string[];
  }>,
): ManualFallbackArtifact {
  return {
    kind: "manual_fallback",
    provider: input.provider,
    resourceNameHint: input.resourceNameHint,
    steps: [...input.steps],
    title: input.title,
  };
}
