"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Application toast renderer with theme-aware defaults and icon mappings.
 *
 * @param props - Sonner toaster props forwarded to the underlying renderer.
 * @returns Configured Sonner toaster component.
 */
export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();
  const resolvedTheme: ToasterProps["theme"] =
    theme === "dark" || theme === "light" || theme === "system"
      ? theme
      : "system";

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      icons={{
        error: <OctagonXIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
        success: <CircleCheckIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
      }}
      style={
        {
          "--border-radius": "var(--radius)",
          "--normal-bg": "var(--popover)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--popover-foreground)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
