import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { SiteHeader } from "@/components/shell/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Unified authenticated shell with sidebar and sticky top header.
 *
 * @param props - Shell props containing routed page content.
 * @returns Full authenticated app shell.
 */
export function AppShell(
  props: Readonly<{
    children: ReactNode;
  }>,
) {
  const { children } = props;

  return (
    <SidebarProvider
      className="bg-muted/20"
      style={
        {
          "--header-height": "3.5rem",
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
    >
      <Suspense
        fallback={
          <div
            aria-hidden="true"
            className="hidden w-(--sidebar-width) shrink-0 md:block"
          />
        }
      >
        <AppSidebar />
      </Suspense>
      <SidebarInset>
        <Suspense
          fallback={
            <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <div className="flex h-(--header-height) items-center gap-2 px-4 md:px-6">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-4 w-56" />
              </div>
            </header>
          }
        >
          <SiteHeader />
        </Suspense>
        <main className="flex flex-1 flex-col" id="main" tabIndex={-1}>
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-6 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
