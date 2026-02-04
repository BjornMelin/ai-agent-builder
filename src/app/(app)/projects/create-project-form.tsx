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
  const errorId = "create-project-form-error";

  return (
    <form
      action={formAction}
      aria-describedby={state.status === "error" ? errorId : undefined}
      className="flex flex-col gap-3"
    >
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
            required
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
        <p className="text-destructive text-sm" id={errorId} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button aria-busy={isPending} disabled={isPending} type="submit">
          <span className="inline-flex items-center gap-2">
            {isPending ? (
              <span
                aria-hidden="true"
                className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            <span>Create project</span>
          </span>
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
