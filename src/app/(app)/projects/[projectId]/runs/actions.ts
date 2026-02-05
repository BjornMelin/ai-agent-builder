"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/require-app-user";
import { normalizeError } from "@/lib/core/errors";
import {
  cancelProjectRun,
  startProjectRun,
} from "@/lib/runs/project-run.server";

/** Result state for the start-run server action. */
export type StartRunActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>;

const initialStartRunState: StartRunActionState = { status: "idle" };

const startRunSchema = z.strictObject({
  kind: z.enum(["research", "implementation"]),
  projectId: z.string().min(1),
});

function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Start a new durable run for a project.
 *
 * @param _prevState - Previous action state (unused).
 * @param formData - Form payload.
 * @returns Next action state.
 * @throws Error - Re-throws Next.js redirect control-flow errors.
 */
export async function startRunAction(
  _prevState: StartRunActionState,
  formData: FormData,
): Promise<StartRunActionState> {
  await requireAppUser();

  const parsed = startRunSchema.safeParse({
    kind: String(formData.get("kind") ?? ""),
    projectId: String(formData.get("projectId") ?? ""),
  });

  if (!parsed.success) {
    return { message: "Invalid run request.", status: "error" };
  }

  try {
    const run = await startProjectRun(parsed.data);
    redirect(`/projects/${parsed.data.projectId}/runs/${run.id}`);
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    const normalized = normalizeError(err);
    return { message: normalized.message, status: "error" };
  }
}

/**
 * `startRunInitialState` is the initial idle state used by `startRunAction`.
 */
export const startRunInitialState = initialStartRunState;

/** Result state for the cancel-run server action. */
export type CancelRunActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>;

const initialCancelRunState: CancelRunActionState = { status: "idle" };

const cancelRunSchema = z.strictObject({
  projectId: z.string().min(1),
  runId: z.string().min(1),
});

/**
 * Cancel a durable run for a project.
 *
 * @param _prevState - Previous action state (unused).
 * @param formData - Form payload.
 * @returns Next action state.
 * @throws Error Re-throws Next.js redirect control-flow errors.
 */
export async function cancelRunAction(
  _prevState: CancelRunActionState,
  formData: FormData,
): Promise<CancelRunActionState> {
  await requireAppUser();

  const parsed = cancelRunSchema.safeParse({
    projectId: String(formData.get("projectId") ?? ""),
    runId: String(formData.get("runId") ?? ""),
  });

  if (!parsed.success) {
    return { message: "Invalid cancel request.", status: "error" };
  }

  try {
    await cancelProjectRun(parsed.data.runId);
    redirect(`/projects/${parsed.data.projectId}/runs/${parsed.data.runId}`);
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    const normalized = normalizeError(err);
    return { message: normalized.message, status: "error" };
  }
}

/**
 * `cancelRunInitialState` exposes `initialCancelRunState` as the initial idle
 * state used by `cancelRunAction`.
 */
export const cancelRunInitialState = initialCancelRunState;
