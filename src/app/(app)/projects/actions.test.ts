import {
  getRedirectError,
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
} from "next/dist/client/components/redirect";
import {
  isRedirectError,
  RedirectType,
} from "next/dist/client/components/redirect-error";
import { RedirectStatusCode } from "next/dist/client/components/redirect-status-code";
import { beforeEach, describe, expect, it, vi } from "vitest";

const REDIRECT_TYPE_PUSH = RedirectType.push;
const REDIRECT_STATUS_TEMPORARY_REDIRECT = RedirectStatusCode.TemporaryRedirect;

const state = vi.hoisted(() => ({
  createProject: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw getRedirectError(
      path,
      REDIRECT_TYPE_PUSH,
      REDIRECT_STATUS_TEMPORARY_REDIRECT,
    );
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

    let thrown: unknown = null;
    try {
      await createProjectAction({ status: "idle" }, formData);
    } catch (err) {
      thrown = err;
    }

    expect(isRedirectError(thrown)).toBe(true);
    if (isRedirectError(thrown)) {
      expect(getURLFromRedirectError(thrown)).toBe("/projects/proj_1");
      expect(getRedirectStatusCodeFromError(thrown)).toBe(307);
    }

    expect(state.createProject).toHaveBeenCalledWith({
      name: "Alpha",
      ownerUserId: "user_1",
      slug: "alpha",
    });
    expect(state.revalidateTag).toHaveBeenCalledWith(
      "aab:projects:index:user_1",
      "max",
    );
  });
});
