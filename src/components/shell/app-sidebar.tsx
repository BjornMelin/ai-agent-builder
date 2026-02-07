"use client";

import {
  CommandIcon,
  FolderKanbanIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const shellPrimaryNavItems = [
  {
    href: "/projects",
    icon: FolderKanbanIcon,
    label: "Projects",
  },
  {
    href: "/search",
    icon: SearchIcon,
    label: "Global Search",
  },
] as const;

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Primary authenticated app sidebar.
 *
 * @returns Sidebar navigation UI.
 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-10"
              size="lg"
              tooltip="AI Agent Builder"
            >
              <Link href="/projects">
                <div className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md">
                  <CommandIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">
                    AI Agent Builder
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    Workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {shellPrimaryNavItems.map((item) => {
                const isActive = isActivePath(pathname, item.href);
                const Icon = item.icon;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        href={item.href}
                      >
                        <Icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div
          className={cn(
            "bg-sidebar-accent/40 flex items-center justify-between gap-2 rounded-lg border p-2",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1",
          )}
        >
          <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <SparklesIcon className="size-4 text-primary" />
            <span className="truncate text-xs text-sidebar-foreground/80">
              Startup mode
            </span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
