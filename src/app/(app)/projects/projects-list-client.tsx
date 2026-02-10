"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * A single project row rendered in the projects list.
 */
export type ProjectListItem = Readonly<{
  id: string;
  name: string;
  slug: string | null;
}>;

const ITEM_GAP_PX = 8; // matches `gap-2`

const useHydrated = () =>
  useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

/**
 * Virtualized project list for the `/projects` page.
 *
 * @param props - List props including project rows.
 * @returns A list that renders all rows before hydration, then virtualizes on the client.
 */
export function ProjectsListClient(
  props: Readonly<{ projects: readonly ProjectListItem[] }>,
) {
  const hydrated = useHydrated();
  const { projects } = props;

  const rowVirtualizer = useWindowVirtualizer({
    count: projects.length,
    estimateSize: () => 60, // row height + `gap-2`
    overscan: 12,
  });

  if (!hydrated) {
    return (
      <ul
        className="grid gap-2"
        style={{
          containIntrinsicSize: "auto 220px",
          contentVisibility: "auto",
        }}
      >
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
              href={`/projects/${encodeURIComponent(project.id)}`}
              prefetch={false}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{project.name}</p>
                <p className="truncate text-muted-foreground text-sm">
                  {project.slug ?? ""}
                </p>
              </div>
              <span className="text-muted-foreground text-sm transition-colors group-hover:text-foreground">
                Open
              </span>
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
        const project = projects[row.index];
        if (!project) return null;

        return (
          <li
            className="absolute top-0 left-0 w-full pb-2"
            data-index={row.index}
            key={project.id}
            ref={rowVirtualizer.measureElement}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            <Link
              className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
              href={`/projects/${encodeURIComponent(project.id)}`}
              prefetch={false}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{project.name}</p>
                <p className="truncate text-muted-foreground text-sm">
                  {project.slug ?? ""}
                </p>
              </div>
              <span className="text-muted-foreground text-sm transition-colors group-hover:text-foreground">
                Open
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
