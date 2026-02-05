"use client";

import { useActionState } from "react";

import {
  cancelRunAction,
  cancelRunInitialState,
} from "@/app/(app)/projects/[projectId]/runs/actions";
import { Button } from "@/components/ui/button";

/**
 * Run cancel button (server action).
 *
 * @param props - Cancel props.
 * @returns Cancel UI.
 */
export function RunCancelClient(
  props: Readonly<{ canCancel: boolean; projectId: string; runId: string }>,
) {
  const [state, formAction, isPending] = useActionState(
    cancelRunAction,
    cancelRunInitialState,
  );
  const errorId = `run-cancel-error-${props.runId}`;

  return (
    <form
      action={formAction}
      aria-describedby={state.status === "error" ? errorId : undefined}
      className="flex flex-col gap-2"
    >
      <input name="projectId" type="hidden" value={props.projectId} />
      <input name="runId" type="hidden" value={props.runId} />

      {state.status === "error" ? (
        <p className="text-destructive text-sm" id={errorId} role="alert">
          {state.message}
        </p>
      ) : null}

      <Button
        aria-busy={isPending}
        disabled={isPending || !props.canCancel}
        type="submit"
        variant="destructive"
      >
        <span className="inline-flex items-center gap-2">
          {isPending ? (
            <span
              aria-hidden="true"
              className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : null}
          <span>Cancel run</span>
        </span>
      </Button>
    </form>
  );
}
