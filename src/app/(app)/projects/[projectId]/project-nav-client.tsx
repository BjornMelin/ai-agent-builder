"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = Readonly<{ href: string; label: string }>;

/**
 * Project sub-navigation (client-only for active state).
 *
 * @param props - Component props.
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
    { href: `${base}/search`, label: "Search" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive =
          item.label === "Overview"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        return (
          <Button
            asChild
            className={cn("h-9 px-3", isActive ? "bg-muted" : "bg-transparent")}
            key={item.href}
            variant="ghost"
          >
            <Link aria-current={isActive ? "page" : undefined} href={item.href}>
              {item.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
