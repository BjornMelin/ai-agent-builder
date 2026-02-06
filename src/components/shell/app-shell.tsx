import type { CSSProperties, ReactNode } from "react";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { SiteHeader } from "@/components/shell/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <main className="flex flex-1 flex-col" id="main" tabIndex={-1}>
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-10 pt-6 md:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
