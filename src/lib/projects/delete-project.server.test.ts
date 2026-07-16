import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  assertProjectUploadGrantsSettled: vi.fn(),
  claimProjectDeletionForUser: vi.fn(),
  del: vi.fn(),
  deleteNamespace: vi.fn(),
  hardDeleteProjectForUser: vi.fn(),
  list: vi.fn(),
  listNamespaces: vi.fn(),
  prepareProjectDeletionForUser: vi.fn(),
  purgeProjectRetrievalCache: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: state.del, list: state.list }));

vi.mock("@/lib/ai/tools/retrieval.server", () => ({
  purgeProjectRetrievalCache: state.purgeProjectRetrievalCache,
}));

vi.mock("@/lib/data/project-upload-grants.server", () => ({
  assertProjectUploadGrantsSettled: state.assertProjectUploadGrantsSettled,
}));

vi.mock("@/lib/data/projects.server", () => ({
  claimProjectDeletionForUser: state.claimProjectDeletionForUser,
  hardDeleteProjectForUser: state.hardDeleteProjectForUser,
  prepareProjectDeletionForUser: state.prepareProjectDeletionForUser,
}));

vi.mock("@/lib/env", () => ({
  env: { blob: { readWriteToken: "blob_token" } },
}));

vi.mock("@/lib/upstash/vector.server", () => ({
  getVectorIndex: () => ({
    deleteNamespace: state.deleteNamespace,
    listNamespaces: state.listNamespaces,
  }),
  projectArtifactsNamespace: (projectId: string) =>
    `project:${projectId}:artifacts`,
  projectChunksNamespace: (projectId: string) => `project:${projectId}:chunks`,
  projectRepoNamespace: (projectId: string, repoId: string) =>
    `project:${projectId}:repo:${repoId}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.del.mockResolvedValue(undefined);
  state.assertProjectUploadGrantsSettled.mockResolvedValue(undefined);
  state.claimProjectDeletionForUser.mockResolvedValue({
    slug: "project",
    status: "deleting",
  });
  state.deleteNamespace.mockResolvedValue("ok");
  state.hardDeleteProjectForUser.mockResolvedValue(undefined);
  state.listNamespaces.mockResolvedValue([
    "project:proj_1:chunks",
    "project:proj_1:artifacts",
    "project:proj_1:repo:repo_1",
    "project:proj_1:future:orphan",
    "project:another-project:chunks",
  ]);
  state.list.mockResolvedValue({ blobs: [], hasMore: false });
  state.purgeProjectRetrievalCache.mockResolvedValue(undefined);
  state.prepareProjectDeletionForUser.mockResolvedValue({
    blobRefs: ["blob/a", "blob/b"],
    project: { slug: "project" },
  });
});

describe("deleteProjectForUser", () => {
  it("requires the exact project slug before cleanup", async () => {
    state.claimProjectDeletionForUser.mockRejectedValueOnce(
      Object.assign(new Error("Type the project slug exactly."), {
        code: "project_confirmation_mismatch",
        status: 400,
      }),
    );
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await expect(
      deleteProjectForUser({
        confirmation: "wrong",
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({
      code: "project_confirmation_mismatch",
      status: 400,
    });
    expect(state.del).not.toHaveBeenCalled();
    expect(state.deleteNamespace).not.toHaveBeenCalled();
    expect(state.hardDeleteProjectForUser).not.toHaveBeenCalled();
  });

  it("deletes blobs and every vector namespace before the database row", async () => {
    state.list
      .mockResolvedValueOnce({
        blobs: [{ url: "blob/prefix-only" }],
        cursor: "next-page",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        blobs: [{ url: "blob/second-page" }],
        hasMore: false,
      });
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await deleteProjectForUser({
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    });

    expect(state.del).toHaveBeenCalledWith(
      ["blob/a", "blob/b", "blob/prefix-only", "blob/second-page"],
      {
        token: "blob_token",
      },
    );
    expect(
      state.deleteNamespace.mock.calls.map(([namespace]) => namespace),
    ).toEqual([
      "project:proj_1:chunks",
      "project:proj_1:artifacts",
      "project:proj_1:repo:repo_1",
      "project:proj_1:future:orphan",
    ]);
    expect(state.hardDeleteProjectForUser).toHaveBeenCalledWith({
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    });
    expect(state.purgeProjectRetrievalCache).toHaveBeenCalledWith("proj_1");
  });

  it("keeps the deletion tombstone until every issued upload token settles", async () => {
    state.assertProjectUploadGrantsSettled.mockRejectedValueOnce(
      Object.assign(new Error("Client upload still authorized."), {
        code: "project_uploads_pending",
        status: 409,
      }),
    );
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );

    await expect(
      deleteProjectForUser({
        confirmation: "project",
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "project_uploads_pending", status: 409 });

    expect(state.claimProjectDeletionForUser).toHaveBeenCalledOnce();
    expect(state.prepareProjectDeletionForUser).not.toHaveBeenCalled();
    expect(state.list).not.toHaveBeenCalled();
    expect(state.hardDeleteProjectForUser).not.toHaveBeenCalled();
  });

  it("keeps the database row when external cleanup fails", async () => {
    state.deleteNamespace.mockRejectedValueOnce(
      new Error("vector unavailable"),
    );
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await expect(
      deleteProjectForUser({
        confirmation: "project",
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "project_vector_cleanup_failed" });
    expect(state.hardDeleteProjectForUser).not.toHaveBeenCalled();
  });

  it("fails closed when Blob pagination omits its continuation cursor", async () => {
    state.list.mockResolvedValueOnce({
      blobs: [],
      hasMore: true,
    });
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await expect(
      deleteProjectForUser({
        confirmation: "project",
        projectId: "proj_1",
        userId: "user_1",
      }),
    ).rejects.toMatchObject({ code: "project_blob_cleanup_failed" });
    expect(state.hardDeleteProjectForUser).not.toHaveBeenCalled();
  });

  it("deletes an empty project without calling missing namespaces", async () => {
    state.prepareProjectDeletionForUser.mockResolvedValueOnce({
      blobRefs: [],
      project: { slug: "project" },
    });
    state.listNamespaces.mockResolvedValueOnce([]);
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await deleteProjectForUser({
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    });

    expect(state.del).not.toHaveBeenCalled();
    expect(state.deleteNamespace).not.toHaveBeenCalled();
    expect(state.hardDeleteProjectForUser).toHaveBeenCalledOnce();
  });

  it("deletes only namespaces that remain after a partial retry", async () => {
    state.listNamespaces.mockResolvedValueOnce([
      "project:proj_1:repo:repo_1",
      "project:another-project:chunks",
    ]);
    const { deleteProjectForUser } = await import(
      "@/lib/projects/delete-project.server"
    );
    await deleteProjectForUser({
      confirmation: "project",
      projectId: "proj_1",
      userId: "user_1",
    });

    expect(state.deleteNamespace).toHaveBeenCalledOnce();
    expect(state.deleteNamespace).toHaveBeenCalledWith(
      "project:proj_1:repo:repo_1",
    );
    expect(state.hardDeleteProjectForUser).toHaveBeenCalledOnce();
  });
});
