"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppUser } from "@/lib/auth/require-app-user";
import { tagProjectsIndex } from "@/lib/cache/tags";
import { normalizeError } from "@/lib/core/errors";
import { createProject } from "@/lib/data/projects.server";

/** Result state for the create-project server action. */
export type CreateProjectActionState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>;

const initialState: CreateProjectActionState = { status: "idle" };

function toSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  // Keep slugs comfortably under the DB limit so suffix attempts fit.
  return normalized.slice(0, 80);
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "23505";
}

function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Create a new project from a form POST.
 *
 * @param _prevState - Previous action state (unused).
 * @param formData - Form payload from the client.
 * @returns Next action state.
 * @throws Error Re-throws Next.js redirect control-flow errors.
 */
export async function createProjectAction(
  _prevState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const user = await requireAppUser();

  const isDemo = String(formData.get("demo") ?? "") === "true";

  const rawName = isDemo ? "Demo project" : String(formData.get("name") ?? "");
  const rawSlug = isDemo
    ? `demo-${Date.now()}`
    : String(formData.get("slug") ?? "");

  const name = rawName.trim();
  if (name.length === 0) {
    return { message: "Project name is required.", status: "error" };
  }

  const baseSlug = toSlug(rawSlug.length > 0 ? rawSlug : name);
  if (baseSlug.length === 0) {
    return {
      message:
        "Project slug is required (or your project name must contain letters/numbers).",
      status: "error",
    };
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${baseSlug}${suffix}`.slice(0, 128);

    try {
      const project = await createProject({ name, ownerUserId: user.id, slug });
      revalidateTag(tagProjectsIndex(user.id), "max");
      redirect(`/projects/${project.id}`);
    } catch (err) {
      if (isRedirectError(err)) {
        throw err;
      }

      if (isUniqueViolation(err)) {
        continue;
      }

      const normalized = normalizeError(err);
      return { message: normalized.message, status: "error" };
    }
  }

  return {
    message:
      "Project slug is already taken. Try a different slug (or a different name).",
    status: "error",
  };
}

/**
 * Initial state used by createProjectAction.
 *
 * @returns The initial idle state before form submission starts.
 */
export const createProjectInitialState = initialState;
