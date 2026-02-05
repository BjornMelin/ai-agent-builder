import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/data/artifacts.server";
import type { ProjectDto } from "@/lib/data/projects.server";

const state = vi.hoisted(() => ({
  buildExportZipStream: vi.fn(),
  getProjectById: vi.fn(),
  listCitationsByArtifactIds: vi.fn(),
  listLatestArtifacts: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectById: state.getProjectById,
}));

vi.mock("@/lib/data/artifacts.server", () => ({
  listLatestArtifacts: state.listLatestArtifacts,
}));

vi.mock("@/lib/data/citations.server", () => ({
  listCitationsByArtifactIds: state.listCitationsByArtifactIds,
}));

vi.mock("@/lib/export/zip.server", () => ({
  artifactExportBasePath: (input: {
    kind: string;
    logicalKey: string;
    version: number;
  }) => `${input.kind}/${input.logicalKey}.v${input.version}`,
  buildExportZipStream: state.buildExportZipStream,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/export/[projectId]/route");
  return mod.GET;
}

const projectId = "proj_123";
const now = new Date(0).toISOString();

const baseProject = {
  createdAt: now,
  id: projectId,
  name: "Project",
  slug: "project",
  status: "active",
  updatedAt: now,
} satisfies ProjectDto;

beforeEach(() => {
  vi.clearAllMocks();
  state.requireAppUserApi.mockResolvedValue({ id: "user" });
  state.getProjectById.mockResolvedValue(baseProject);
  state.listLatestArtifacts.mockResolvedValue([] satisfies ArtifactDto[]);
  state.listCitationsByArtifactIds.mockResolvedValue([]);
  state.buildExportZipStream.mockResolvedValue({
    manifest: {
      entries: [],
      project: { id: projectId, name: "Project", slug: "project" },
      version: 1,
    },
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    }),
  });
});

describe("GET /api/export/[projectId]", () => {
  it("requires auth", async () => {
    const GET = await loadRoute();
    state.requireAppUserApi.mockRejectedValueOnce(new Error("no auth"));

    const res = await GET(new Request("http://localhost/api/export/proj"), {
      params: Promise.resolve({ projectId }),
    });

    expect(res.status).toBe(500);
    expect(state.requireAppUserApi).toHaveBeenCalledTimes(1);
    expect(state.getProjectById).not.toHaveBeenCalled();
    expect(state.listLatestArtifacts).not.toHaveBeenCalled();
    expect(state.listCitationsByArtifactIds).not.toHaveBeenCalled();
    expect(state.buildExportZipStream).not.toHaveBeenCalled();
  });

  it("returns 404 when project is missing", async () => {
    const GET = await loadRoute();
    state.getProjectById.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/export/proj"), {
      params: Promise.resolve({ projectId }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
    expect(state.requireAppUserApi).toHaveBeenCalledTimes(1);
    expect(state.getProjectById).toHaveBeenCalledWith(projectId);
    expect(state.listLatestArtifacts).not.toHaveBeenCalled();
    expect(state.listCitationsByArtifactIds).not.toHaveBeenCalled();
    expect(state.buildExportZipStream).not.toHaveBeenCalled();
  });

  it("returns a zip response with download headers", async () => {
    const GET = await loadRoute();

    const res = await GET(new Request("http://localhost/api/export/proj"), {
      params: Promise.resolve({ projectId }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain(".zip");
    expect(state.requireAppUserApi).toHaveBeenCalledTimes(1);
    expect(state.getProjectById).toHaveBeenCalledWith(projectId);
    expect(state.listLatestArtifacts).toHaveBeenCalledWith(projectId, {
      limit: 500,
    });
    expect(state.listCitationsByArtifactIds).toHaveBeenCalledWith([]);
    expect(state.buildExportZipStream).toHaveBeenCalledTimes(1);
  });
});
