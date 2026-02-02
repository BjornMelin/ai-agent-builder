const supportedAuthSocialProviders = ["github", "vercel"] as const;

/**
 * Supported OAuth providers for Neon Auth UI buttons.
 */
export type AuthSocialProvider = (typeof supportedAuthSocialProviders)[number];

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Parse the `NEXT_PUBLIC_AUTH_SOCIAL_PROVIDERS` env var.
 *
 * Rules:
 * - `undefined` → defaults to all supported providers
 * - empty / whitespace → disables social providers (no OAuth buttons)
 * - unknown tokens are ignored
 *
 * @param raw - Raw env var value.
 * @returns Normalized unique providers.
 */
export function parseAuthSocialProviders(
  raw: string | undefined,
): ReadonlyArray<AuthSocialProvider> {
  if (raw === undefined) {
    return supportedAuthSocialProviders;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const providers = new Set<AuthSocialProvider>();
  for (const token of parseCommaSeparatedList(trimmed)) {
    const normalized = token.toLowerCase();
    if (
      (supportedAuthSocialProviders as readonly string[]).includes(normalized)
    ) {
      providers.add(normalized as AuthSocialProvider);
    }
  }

  return Array.from(providers);
}
