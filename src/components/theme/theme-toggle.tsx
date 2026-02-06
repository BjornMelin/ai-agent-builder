"use client";

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const themeOptions = [
  { icon: SunIcon, key: "light", label: "Light" },
  { icon: MoonIcon, key: "dark", label: "Dark" },
  { icon: MonitorIcon, key: "system", label: "System" },
] as const;

/**
 * Theme switcher dropdown for `light`, `dark`, and `system` modes.
 *
 * @returns Theme toggle control.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Toggle color theme"
          className="shrink-0"
          size="icon-sm"
          variant="outline"
        >
          {mounted && resolvedTheme === "dark" ? (
            <MoonIcon className="size-4" />
          ) : (
            <SunIcon className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = activeTheme === option.key;

          return (
            <DropdownMenuItem
              key={option.key}
              onClick={() => {
                setTheme(option.key);
              }}
            >
              <Icon className="size-4" />
              <span>{option.label}</span>
              <CheckIcon
                className={cn(
                  "ml-auto size-4 text-primary transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
