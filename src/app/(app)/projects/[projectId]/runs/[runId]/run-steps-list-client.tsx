"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

import type { RunStepDto } from "@/lib/data/runs.server";
import { cn } from "@/lib/utils";

/** Props for {@link RunStepsListClient}. */
export type RunStepsListClientProps = Readonly<{
  steps: readonly RunStepDto[];
  className?: string;
}>;

/**
 * Virtualized list of run steps to avoid rendering large DOM lists.
 *
 * @param props - Component props.
 * @returns A scrollable, virtualized list of run steps.
 */
export function RunStepsListClient(props: RunStepsListClientProps) {
  const { className, steps } = props;
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: steps.length,
    estimateSize: () => 56,
    getScrollElement: () => parentRef.current,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={cn("max-h-[420px] overflow-auto pr-1", className)}
      ref={parentRef}
    >
      <ul
        className="relative grid gap-2"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((item) => {
          const step = steps[item.index];
          if (!step) return null;

          return (
            <li
              className="absolute left-0 top-0 w-full"
              key={step.id}
              style={{
                transform: `translateY(${item.start}px)`,
              }}
            >
              <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{step.stepName}</p>
                  <p className="truncate text-muted-foreground text-sm">
                    {step.status} · {step.stepKind} ·{" "}
                    <span className="font-mono text-xs">{step.stepId}</span>
                  </p>
                </div>
                <span className="text-muted-foreground text-sm">Step</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
