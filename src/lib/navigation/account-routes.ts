export const ACCOUNT_ROUTES = [
  {
    href: "/account/settings",
    label: "Account",
    segment: "settings",
  },
  {
    href: "/account/security",
    label: "Security",
    segment: "security",
  },
] as const;

/**
 * Account route type definition.
 */
export type AccountRoute = (typeof ACCOUNT_ROUTES)[number];

/**
 * Default account route.
 */
export const ACCOUNT_DEFAULT_ROUTE = ACCOUNT_ROUTES[0];

/**
 * Resolve account route metadata by segment.
 *
 * @param segment - Account route segment.
 * @returns Matched account route, if found.
 */
export function getAccountRoute(segment: string): AccountRoute | undefined {
  if (segment === "settings") {
    return ACCOUNT_ROUTES[0];
  }
  if (segment === "security") {
    return ACCOUNT_ROUTES[1];
  }
  return undefined;
}
