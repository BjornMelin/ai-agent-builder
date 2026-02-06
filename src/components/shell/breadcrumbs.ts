import {
  ACCOUNT_DEFAULT_ROUTE,
  getAccountRoute,
} from "@/lib/navigation/account-routes";

/**
 * Breadcrumb item rendered in the app shell header.
 */
export type ShellBreadcrumb = Readonly<{
  href: string;
  label: string;
}>;

function toLabel(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

/**
 * Resolve shell breadcrumbs from the current pathname.
 *
 * @param pathname - Current URL pathname.
 * @returns Ordered breadcrumb list.
 */
export function resolveShellBreadcrumbs(pathname: string): ShellBreadcrumb[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [{ href: "/projects", label: "Projects" }];
  }

  if (segments[0] === "account") {
    const crumbs: ShellBreadcrumb[] = [
      { href: ACCOUNT_DEFAULT_ROUTE.href, label: ACCOUNT_DEFAULT_ROUTE.label },
    ];

    if (segments.length > 1 && segments[1] !== ACCOUNT_DEFAULT_ROUTE.segment) {
      crumbs.push(
        ...segments.slice(1).map((segment, index) => {
          const route = getAccountRoute(segment);
          return {
            href:
              route?.href ??
              `/account/${segments.slice(1, index + 2).join("/")}`,
            label: route?.label ?? toLabel(segment),
          };
        }),
      );
    }

    return crumbs;
  }

  if (segments[0] !== "projects") {
    return segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      return { href, label: toLabel(segment) };
    });
  }

  const crumbs: ShellBreadcrumb[] = [{ href: "/projects", label: "Projects" }];

  if (segments.length >= 2) {
    crumbs.push({ href: `/projects/${segments[1]}`, label: "Project" });
  }

  if (segments.length > 2) {
    crumbs.push(
      ...segments.slice(2).map((segment, index) => {
        const href = `/projects/${segments[1]}/${segments
          .slice(2, index + 3)
          .join("/")}`;
        return { href, label: toLabel(segment) };
      }),
    );
  }

  return crumbs;
}
