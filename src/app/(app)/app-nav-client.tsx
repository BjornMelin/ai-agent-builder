"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppNavItem = Readonly<{ href: string; label: string }>;

/**
 * Global authenticated app navigation.
 *
 * @returns Top-level app navigation links.
 */
export function AppNavClient() {
  const pathname = usePathname();
  const items: readonly AppNavItem[] = [
    { href: "/projects", label: "Projects" },
    { href: "/search", label: "Search" },
  ];

  return (
    <nav aria-label="Application sections" className="flex items-center gap-2">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

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
