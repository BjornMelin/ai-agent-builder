"use client";

import { useActionState, useState } from "react";

import {
  startRunAction,
  startRunInitialState,
} from "@/app/(app)/projects/[projectId]/runs/actions";
import { Button } from "@/components/ui/button";

/**
 * Run controls for starting new runs (server action).
 *
 * @param props - Control props.
 * @returns Run control UI.
 */
export function RunControlsClient(props: Readonly<{ projectId: string }>) {
  const [submittedKind, setSubmittedKind] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    startRunAction,
    startRunInitialState,
  );
  const errorId = `runs-start-error-${props.projectId}`;

  return (
    <form
      action={formAction}
      aria-describedby={state.status === "error" ? errorId : undefined}
      className="space-y-3"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        setSubmittedKind(submitter?.getAttribute("value") ?? null);
      }}
    >
      <input name="projectId" type="hidden" value={props.projectId} />

      {state.status === "error" ? (
        <p className="text-destructive text-sm" id={errorId} role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          aria-busy={isPending && submittedKind === "research"}
          disabled={isPending}
          name="kind"
          type="submit"
          value="research"
        >
          <span className="inline-flex items-center gap-2">
            {isPending && submittedKind === "research" ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : null}
            <span>Start research run</span>
          </span>
        </Button>

        <Button
          aria-busy={isPending && submittedKind === "implementation"}
          disabled={isPending}
          name="kind"
          type="submit"
          value="implementation"
          variant="secondary"
        >
          <span className="inline-flex items-center gap-2">
            {isPending && submittedKind === "implementation" ? (
              <span
                aria-hidden="true"
                className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : null}
            <span>Start implementation run</span>
          </span>
        </Button>

        <p className="text-muted-foreground text-sm">
          Runs are durable workflows backed by Workflow DevKit.
        </p>
      </div>
    </form>
  );
}
