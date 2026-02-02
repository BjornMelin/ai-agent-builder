"use client";

import { type ReactNode, useSyncExternalStore } from "react";

let hasHydrated = false;
let hydrationScheduled = false;
const hydrationListeners = new Set<() => void>();

function notifyHydrationListeners() {
  for (const listener of Array.from(hydrationListeners)) {
    listener();
  }
}

function scheduleHydration() {
  if (hydrationScheduled || hasHydrated) {
    return;
  }

  hydrationScheduled = true;
  const run = () => {
    hydrationScheduled = false;
    hasHydrated = true;
    notifyHydrationListeners();
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
}

function subscribe(onStoreChange: () => void) {
  hydrationListeners.add(onStoreChange);
  scheduleHydration();

  return () => {
    hydrationListeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return hasHydrated;
}

function getServerSnapshot() {
  return false;
}

/**
 * Renders children only after the component has mounted on the client.
 *
 * @param props - Component props.
 * @returns The client-only children or an optional fallback.
 */
export function ClientOnly(
  props: Readonly<{
    children: ReactNode;
    fallback?: ReactNode;
  }>,
) {
  const { children, fallback = null } = props;
  const mounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return mounted ? children : fallback;
}
