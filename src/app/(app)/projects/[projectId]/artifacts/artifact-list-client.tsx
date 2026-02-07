"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * A single artifact row rendered in the artifacts list.
 */
export type ArtifactListItem = Readonly<{
  id: string;
  kind: string;
  logicalKey: string;
  title: string;
  version: number;
}>;

const ITEM_GAP_PX = 8; // matches `gap-2`

const useHydrated = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

/**
 * Virtualized artifact list for the project artifacts page.
 *
 * @param props - List props including project id and artifact rows.
 * @returns A list that renders all rows before hydration, then virtualizes on the client.
 */
export function ArtifactListClient(
  props: Readonly<{
    projectId: string;
    artifacts: readonly ArtifactListItem[];
  }>,
) {
  const { projectId, artifacts } = props;
  const hydrated = useHydrated();

  const rowVirtualizer = useWindowVirtualizer({
    count: artifacts.length,
    estimateSize: () => 64, // row height + `gap-2`
    overscan: 12,
  });

  if (!hydrated) {
    return (
      <ul
        className="grid gap-2"
        style={{
          containIntrinsicSize: "auto 200px",
          contentVisibility: "auto",
        }}
      >
        {artifacts.map((a) => (
          <li
            className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
            key={a.id}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{a.title}</p>
              <p className="truncate text-muted-foreground text-sm">
                {a.kind} · {a.logicalKey} · v{a.version}
              </p>
            </div>
            <Link
              className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
              href={`/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(
                a.id,
              )}`}
              prefetch={false}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = Math.max(0, rowVirtualizer.getTotalSize() - ITEM_GAP_PX);

  return (
    <ul className="relative" style={{ height: `${totalSize}px` }}>
      {virtualItems.map((row) => {
        const artifact = artifacts[row.index];
        if (!artifact) return null;

        return (
          <li
            className="absolute top-0 left-0 w-full pb-2"
            data-index={row.index}
            key={artifact.id}
            ref={rowVirtualizer.measureElement}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{artifact.title}</p>
                <p className="truncate text-muted-foreground text-sm">
                  {artifact.kind} · {artifact.logicalKey} · v{artifact.version}
                </p>
              </div>
              <Link
                className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
                href={`/projects/${encodeURIComponent(
                  projectId,
                )}/artifacts/${encodeURIComponent(artifact.id)}`}
                prefetch={false}
              >
                Open
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
