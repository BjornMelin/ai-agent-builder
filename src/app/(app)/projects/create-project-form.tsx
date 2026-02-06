"use client";

import { useActionState, useState } from "react";

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
  const [submittedAction, setSubmittedAction] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    createProjectInitialState,
  );
  const errorId = "create-project-form-error";

  return (
    <form
      action={formAction}
      aria-describedby={state.status === "error" ? errorId : undefined}
      className="space-y-4"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        setSubmittedAction(
          submitter?.getAttribute("name") === "demo" ? "demo" : "create",
        );
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="create-project-name">
            Project name
          </label>
          <Input
            autoComplete="off"
            id="create-project-name"
            name="name"
            placeholder="Customer knowledge base…"
            required
          />
          <p className="text-muted-foreground text-xs">
            Human-friendly name shown throughout your workspace.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="font-medium text-sm" htmlFor="create-project-slug">
            Slug (optional)
          </label>
          <Input
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            id="create-project-slug"
            name="slug"
            placeholder="customer-kb…"
            spellCheck={false}
          />
          <p className="text-muted-foreground text-xs">
            URL-safe identifier. Leave blank to auto-generate.
          </p>
        </div>
      </div>

      {state.status === "error" ? (
        <p className="text-destructive text-sm" id={errorId} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          aria-busy={isPending && submittedAction === "create"}
          disabled={isPending}
          type="submit"
        >
          <span className="inline-flex items-center gap-2">
            {isPending && submittedAction === "create" ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : null}
            <span>Create project</span>
          </span>
        </Button>
        <Button
          aria-busy={isPending && submittedAction === "demo"}
          disabled={isPending}
          name="demo"
          type="submit"
          value="true"
          variant="secondary"
        >
          <span className="inline-flex items-center gap-2">
            {isPending && submittedAction === "demo" ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : null}
            <span>Create demo</span>
          </span>
        </Button>
        <p className="text-muted-foreground text-sm">
          Projects scope uploads, search, runs, and chat threads.
        </p>
      </div>
    </form>
  );
}
