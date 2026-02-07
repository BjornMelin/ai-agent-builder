"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveShellBreadcrumbs } from "@/components/shell/breadcrumbs";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Sticky top header for authenticated app pages.
 *
 * @returns Site header with global nav and breadcrumb context.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const breadcrumbs = resolveShellBreadcrumbs(pathname);

  return (
    <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex h-(--header-height) items-center gap-2 px-4 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator className="mx-1 h-4" orientation="vertical" />

        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList className="truncate">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const hideOnSmallScreens =
                index < breadcrumbs.length - 2 ? "hidden lg:inline-flex" : "";

              return [
                <BreadcrumbItem
                  className={cn(hideOnSmallScreens)}
                  key={`item-${crumb.href}`}
                >
                  {isLast ? (
                    <BreadcrumbPage className="max-w-[220px] truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link
                        className="max-w-[220px] truncate"
                        href={crumb.href}
                      >
                        {crumb.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>,
                isLast ? null : (
                  <BreadcrumbSeparator
                    className={cn(hideOnSmallScreens)}
                    key={`sep-${crumb.href}`}
                  />
                ),
              ];
            })}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto md:hidden">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
