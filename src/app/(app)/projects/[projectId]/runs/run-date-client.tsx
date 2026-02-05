"use client";

import { useEffect, useState } from "react";

function formatRelativeDate(createdAt: string): string {
  const createdAtDate = new Date(createdAt);
  if (Number.isNaN(createdAtDate.getTime())) {
    return createdAt;
  }

  const deltaMs = Date.now() - createdAtDate.getTime();
  const absoluteMs = Math.abs(deltaMs);
  const relativeFormat = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (absoluteMs < 60_000) {
    const seconds = Math.round(deltaMs / 1_000);
    return relativeFormat.format(-seconds, "second");
  }
  if (absoluteMs < 3_600_000) {
    const minutes = Math.round(deltaMs / 60_000);
    return relativeFormat.format(-minutes, "minute");
  }
  if (absoluteMs < 86_400_000) {
    const hours = Math.round(deltaMs / 3_600_000);
    return relativeFormat.format(-hours, "hour");
  }
  const days = Math.round(deltaMs / 86_400_000);
  return relativeFormat.format(-days, "day");
}

/**
 * Client-only date formatter for run timestamps.
 *
 * @param props - Date props.
 * @returns A hydrated `<time>` label to avoid server/client locale mismatches.
 */
export function RunDateClient(props: Readonly<{ createdAt: string }>) {
  const [displayValue, setDisplayValue] = useState(() => {
    const createdAtDate = new Date(props.createdAt);
    return Number.isNaN(createdAtDate.getTime())
      ? props.createdAt
      : createdAtDate.toISOString();
  });

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDisplayValue(formatRelativeDate(props.createdAt));
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [props.createdAt]);

  return <time dateTime={props.createdAt}>{displayValue}</time>;
}
