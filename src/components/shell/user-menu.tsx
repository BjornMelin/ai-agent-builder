"use client";

import { LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { ClientOnly } from "@/components/client-only";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCOUNT_DEFAULT_ROUTE } from "@/lib/navigation/account-routes";

/**
 * Hydration-safe current user menu trigger.
 *
 * @returns User profile/menu button.
 */
export function UserMenu() {
  const signOutFormId = "user-menu-sign-out";

  return (
    <ClientOnly fallback={<div aria-hidden="true" className="h-8 w-8" />}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label="Open user menu" size="icon" variant="ghost">
            <UserIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <form
            action="/auth/sign-out"
            className="hidden"
            id={signOutFormId}
            method="post"
          />
          <DropdownMenuItem asChild>
            <Link
              className="flex items-center gap-2"
              href={ACCOUNT_DEFAULT_ROUTE.href}
            >
              <SettingsIcon className="size-4" />
              <span>Account</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button
              className="flex w-full items-center gap-2"
              form={signOutFormId}
              type="submit"
            >
              <LogOutIcon className="size-4" />
              <span>Sign out</span>
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ClientOnly>
  );
}
