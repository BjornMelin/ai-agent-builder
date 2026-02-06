"use client";

import { UserButton } from "@neondatabase/auth/react";

import { ClientOnly } from "@/components/client-only";

/**
 * Hydration-safe current user menu trigger.
 *
 * @returns User profile/menu button.
 */
export function UserMenu() {
  return (
    <ClientOnly fallback={<div aria-hidden="true" className="h-8 w-8" />}>
      <UserButton aria-label="Open user menu" size="icon" />
    </ClientOnly>
  );
}
