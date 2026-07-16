"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth/require-app-user";
import {
  projectCacheTags,
  tagProject,
  tagProjectsIndex,
} from "@/lib/cache/tags";
import { normalizeError } from "@/lib/core/errors";
import {
  setProjectStatusForUser,
  updateProjectForUser,
} from "@/lib/data/projects.server";
import { deleteProjectForUser } from "@/lib/projects/delete-project.server";

/** Result state shared by project lifecycle server actions. */
export type ProjectLifecycleActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "success"; message: string }>
  | Readonly<{ status: "error"; message: string }>;

export const projectLifecycleInitialState: ProjectLifecycleActionState = {
  status: "idle",
};

function readFormString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function isUniqueViolation(err: unknown): boolean {
  return (
    Boolean(err) &&
    typeof err === "object" &&
    (err as { code?: unknown }).code === "23505"
  );
}

function refreshProjectCaches(projectId: string, userId: string): void {
  updateTag(tagProject(projectId));
  updateTag(tagProjectsIndex(userId));
}

/**
 * Update project name and slug for the exact authenticated owner.
 *
 * @param _previous - Previous action state.
 * @param formData - Submitted project metadata.
 * @returns The mutation result for inline feedback.
 */
export async function updateProjectAction(
  _previous: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  const user = await requireAppUser();
  const projectId = readFormString(formData, "projectId");

  try {
    await updateProjectForUser({
      name: readFormString(formData, "name"),
      projectId,
      slug: readFormString(formData, "slug"),
      userId: user.id,
    });
    refreshProjectCaches(projectId, user.id);
    return { message: "Project details updated.", status: "success" };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        message: "That project slug is already in use.",
        status: "error",
      };
    }
    return { message: normalizeError(err).message, status: "error" };
  }
}

/**
 * Archive or restore a project for the exact authenticated owner.
 *
 * @param _previous - Previous action state.
 * @param formData - Submitted project identity and target status.
 * @returns The mutation result for inline feedback.
 */
export async function setProjectStatusAction(
  _previous: ProjectLifecycleActionState,
  formData: FormData,
): Promise<ProjectLifecycleActionState> {
  const user = await requireAppUser();
  const projectId = readFormString(formData, "projectId");
  const status = readFormString(formData, "status");
  if (status !== "active" && status !== "archived") {
    return { message: "Invalid project status.", status: "error" };
  }

  try {
    await setProjectStatusForUser({ projectId, status, userId: user.id });
    refreshProjectCaches(projectId, user.id);
    return {
      message:
        status === "archived" ? "Project archived." : "Project restored.",
      status: "success",
    };
  } catch (err) {
    return { message: normalizeError(err).message, status: "error" };
  }
}

/**
 * Permanently delete an archived project after exact typed confirmation.
 *
 * @param input - Project identity and typed slug confirmation.
 * @returns An error result, or redirects to the project index after success.
 */
export async function deleteProjectAction(
  input: Readonly<{ confirmation: string; projectId: string }>,
): Promise<ProjectLifecycleActionState> {
  const user = await requireAppUser();

  try {
    await deleteProjectForUser({ ...input, userId: user.id });
  } catch (err) {
    return { message: normalizeError(err).message, status: "error" };
  } finally {
    // Claiming deletion changes the project to `deleting` before provider
    // cleanup. Refresh every project surface even when cleanup remains
    // retryable after a provider failure.
    for (const tag of projectCacheTags(input.projectId)) updateTag(tag);
    updateTag(tagProjectsIndex(user.id));
  }

  redirect("/projects");
}
