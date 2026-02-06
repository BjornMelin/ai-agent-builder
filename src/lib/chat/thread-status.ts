/**
 * Shared lifecycle status values for chat threads and related workflow runs.
 */
export type ChatThreadStatus =
  | "pending"
  | "running"
  | "waiting"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";
