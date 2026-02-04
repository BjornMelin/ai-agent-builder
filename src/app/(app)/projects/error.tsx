"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Error boundary for `/projects`.
 *
 * @param props - Error boundary props.
 * @returns Error UI.
 */
export default function ProjectsError(
  props: Readonly<{
    error: Error & { digest?: string };
    reset: () => void;
  }>,
) {
  const { error, reset } = props;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";
  const message = error?.message ?? "Unexpected error.";
  const looksLikeMigrations =
    message.toLowerCase().includes("not migrated") ||
    message.toLowerCase().includes("relation") ||
    message.toLowerCase().includes("undefined_table");

  return (
    <div className="flex flex-col gap-6 pt-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          Couldn&apos;t load Projects
        </h1>
        <p className="text-muted-foreground text-sm">
          {looksLikeMigrations
            ? "This usually happens when database migrations haven’t been applied yet."
            : "Something went wrong while loading the projects page."}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>How to fix</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-1 text-sm">
            <p className="text-muted-foreground">
              Run migrations for the current environment:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
              bun run db:migrate
            </pre>
            <p className="text-muted-foreground">
              For Vercel Preview/Production, ensure your Build Command runs
              migrations (for example: <code>bun run build:vercel</code>).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => reset()}>Retry</Button>
            <Button onClick={() => location.reload()} variant="outline">
              Reload
            </Button>
          </div>

          {isDev ? (
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs">Dev details</p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {message}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
