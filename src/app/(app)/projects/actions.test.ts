import { beforeEach, describe, expect, it, vi } from "vitest";

import { tagProjectsIndex } from "@/lib/cache/tags";

const state = vi.hoisted(() => ({
  createProject: vi.fn(),
  redirect: vi.fn((_path: string) => {
    // Next.js redirect terminates control flow by throwing.
    const err = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    err.digest = "NEXT_REDIRECT";
    throw err;
  }),
  requireAppUser: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: state.revalidateTag,
}));

vi.mock("next/navigation", () => ({
  redirect: state.redirect,
}));

vi.mock("@/lib/auth/require-app-user", () => ({
  requireAppUser: state.requireAppUser,
}));

vi.mock("@/lib/data/projects.server", () => ({
  createProject: state.createProject,
}));

async function loadAction() {
  vi.resetModules();
  return await import("@/app/(app)/projects/actions");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUser.mockResolvedValue({ id: "user_1" });
  state.createProject.mockResolvedValue({ id: "proj_1" });
});

describe("createProjectAction", () => {
  it("revalidates project index before redirecting on success", async () => {
    const { createProjectAction } = await loadAction();

    const formData = new FormData();
    formData.set("name", "Alpha");
    formData.set("slug", "alpha");

    await expect(
      createProjectAction({ status: "idle" }, formData),
    ).rejects.toThrow();
    expect(state.redirect).toHaveBeenCalledWith("/projects/proj_1");

    expect(state.createProject).toHaveBeenCalledWith({
      name: "Alpha",
      ownerUserId: "user_1",
      slug: "alpha",
    });
    expect(state.revalidateTag).toHaveBeenCalledWith(
      tagProjectsIndex("user_1"),
      "max",
    );
  });
});
