import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  projectCacheTags,
  tagProject,
  tagProjectsIndex,
} from "@/lib/cache/tags";

const state = vi.hoisted(() => ({
  deleteProjectForUser: vi.fn(),
  redirect: vi.fn(),
  requireAppUser: vi.fn(),
  setProjectStatusForUser: vi.fn(),
  updateProjectForUser: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({ updateTag: state.updateTag }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("@/lib/auth/require-app-user", () => ({
  requireAppUser: state.requireAppUser,
}));
vi.mock("@/lib/data/projects.server", () => ({
  setProjectStatusForUser: state.setProjectStatusForUser,
  updateProjectForUser: state.updateProjectForUser,
}));
vi.mock("@/lib/projects/delete-project.server", () => ({
  deleteProjectForUser: state.deleteProjectForUser,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUser.mockResolvedValue({ id: "user_1" });
  state.updateProjectForUser.mockResolvedValue({ id: "proj_1" });
  state.setProjectStatusForUser.mockResolvedValue({ id: "proj_1" });
  state.deleteProjectForUser.mockResolvedValue(undefined);
});

describe("project lifecycle actions", () => {
  it("updates metadata and immediately refreshes project caches", async () => {
    const { projectLifecycleInitialState, updateProjectAction } = await import(
      "@/app/(app)/projects/[projectId]/settings/actions"
    );
    const data = new FormData();
    data.set("projectId", "proj_1");
    data.set("name", "Renamed");
    data.set("slug", "renamed");

    await expect(
      updateProjectAction(projectLifecycleInitialState, data),
    ).resolves.toEqual({
      message: "Project details updated.",
      status: "success",
    });
    expect(state.updateProjectForUser).toHaveBeenCalledWith({
      name: "Renamed",
      projectId: "proj_1",
      slug: "renamed",
      userId: "user_1",
    });
    expect(state.updateTag).toHaveBeenCalledWith(tagProject("proj_1"));
    expect(state.updateTag).toHaveBeenCalledWith(tagProjectsIndex("user_1"));
  });

  it("archives and restores only recognized lifecycle states", async () => {
    const { projectLifecycleInitialState, setProjectStatusAction } =
      await import("@/app/(app)/projects/[projectId]/settings/actions");
    const data = new FormData();
    data.set("projectId", "proj_1");
    data.set("status", "archived");
    await expect(
      setProjectStatusAction(projectLifecycleInitialState, data),
    ).resolves.toEqual({ message: "Project archived.", status: "success" });

    data.set("status", "deleting");
    await expect(
      setProjectStatusAction(projectLifecycleInitialState, data),
    ).resolves.toEqual({ message: "Invalid project status.", status: "error" });
  });

  it("deletes with exact owner context, refreshes the index, and redirects", async () => {
    const { deleteProjectAction } = await import(
      "@/app/(app)/projects/[projectId]/settings/actions"
    );
    await deleteProjectAction({
      confirmation: "project",
      projectId: "proj_1",
    });

    expect(state.deleteProjectForUser).toHaveBeenCalledWith({
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    });
    expect(state.updateTag).toHaveBeenCalledWith(tagProjectsIndex("user_1"));
    expect(state.redirect).toHaveBeenCalledWith("/projects");
  });

  it("returns deletion errors without redirecting", async () => {
    state.deleteProjectForUser.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    const { deleteProjectAction } = await import(
      "@/app/(app)/projects/[projectId]/settings/actions"
    );
    await expect(
      deleteProjectAction({
        confirmation: "project",
        projectId: "proj_1",
      }),
    ).resolves.toEqual({ message: "Unexpected error.", status: "error" });
    for (const tag of projectCacheTags("proj_1")) {
      expect(state.updateTag).toHaveBeenCalledWith(tag);
    }
    expect(state.updateTag).toHaveBeenCalledWith(tagProjectsIndex("user_1"));
    expect(state.redirect).not.toHaveBeenCalled();
  });
});
