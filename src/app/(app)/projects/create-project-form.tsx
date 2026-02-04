"use client";

import { useActionState } from "react";
import {
  createProjectAction,
  createProjectInitialState,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Create project form (server action).
 *
 * @returns The create project form UI.
 */
export function CreateProjectForm() {
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    createProjectInitialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-1">
          <label className="font-medium text-sm" htmlFor="create-project-name">
            Project name
          </label>
          <Input
            autoComplete="off"
            id="create-project-name"
            name="name"
            placeholder="My project…"
          />
        </div>
        <div className="grid gap-1">
          <label className="font-medium text-sm" htmlFor="create-project-slug">
            Slug (optional)
          </label>
          <Input
            autoComplete="off"
            id="create-project-slug"
            name="slug"
            placeholder="my-project…"
          />
        </div>
      </div>

      {state.status === "error" ? (
        <p className="text-destructive text-sm">{state.message}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button disabled={isPending} type="submit">
          {isPending ? "Creating…" : "Create project"}
        </Button>
        <Button
          disabled={isPending}
          name="demo"
          type="submit"
          value="true"
          variant="secondary"
        >
          Create demo
        </Button>
        <p className="text-muted-foreground text-sm">
          Projects scope uploads, retrieval, runs, and chat.
        </p>
      </div>
    </form>
  );
}
