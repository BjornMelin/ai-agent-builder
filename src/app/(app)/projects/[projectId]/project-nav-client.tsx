"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = Readonly<{ href: string; label: string }>;

/**
 * Project sub-navigation (client-only for active state).
 *
 * @param props - `ProjectNavClient` props where `projectId` is a required,
 *   non-empty, URL-safe project identifier (for example a UUID or slug) used
 *   as the route segment for every generated nav link.
 * @returns The project navigation bar.
 */
export function ProjectNavClient(props: Readonly<{ projectId: string }>) {
  const pathname = usePathname();

  const base = `/projects/${props.projectId}`;
  const items: readonly NavItem[] = [
    { href: base, label: "Overview" },
    { href: `${base}/uploads`, label: "Uploads" },
    { href: `${base}/chat`, label: "Chat" },
    { href: `${base}/runs`, label: "Runs" },
    { href: `${base}/artifacts`, label: "Artifacts" },
    { href: `${base}/search`, label: "Search" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav aria-label="Project sections" className="-mx-1 overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-2 px-1">
        {items.map((item) => {
          const isActive =
            item.label === "Overview"
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Button
              asChild
              className={cn(
                "h-11 rounded-full px-3.5 text-xs md:h-8",
                isActive
                  ? "border border-border bg-background text-foreground shadow-xs"
                  : "border border-transparent text-muted-foreground",
              )}
              key={item.href}
              variant="ghost"
            >
              <Link
                aria-current={isActive ? "page" : undefined}
                href={item.href}
              >
                {item.label}
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}
