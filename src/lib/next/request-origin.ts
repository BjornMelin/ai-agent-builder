import "server-only";

/**
 * Compute the request origin for absolute callback URLs.
 *
 * Prefer using forwarded headers when present (Vercel, proxies) and fall back to
 * the Origin header when provided by browsers.
 *
 * @param headers - Request headers.
 * @returns Origin string like `https://example.com` or an empty string if unknown.
 */
export function getRequestOrigin(headers: Headers): string {
  const origin = headers.get("origin");
  if (origin && origin.trim().length > 0) return origin;

  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host")?.trim() ||
    "";

  return host ? `${proto}://${host}` : "";
}
