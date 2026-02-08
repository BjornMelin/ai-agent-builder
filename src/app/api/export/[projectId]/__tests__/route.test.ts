import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactDto } from "@/lib/data/artifacts.server";
import type { ProjectDto } from "@/lib/data/projects.server";

const state = vi.hoisted(() => ({
  buildExportZipStream: vi.fn(),
  getMarkdownContent: vi.fn(),
  getProjectByIdForUser: vi.fn(),
  listCitationsByArtifactIds: vi.fn(),
  listLatestArtifacts: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("@/lib/artifacts/content.server", () => ({
  getMarkdownContent: state.getMarkdownContent,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

vi.mock("@/lib/data/projects.server", () => ({
  getProjectByIdForUser: state.getProjectByIdForUser,
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
  state.getProjectByIdForUser.mockResolvedValue(baseProject);
  state.listLatestArtifacts.mockResolvedValue([] satisfies ArtifactDto[]);
  state.listCitationsByArtifactIds.mockResolvedValue([]);
  state.getMarkdownContent.mockReturnValue(null);
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
    expect(state.getProjectByIdForUser).not.toHaveBeenCalled();
    expect(state.listLatestArtifacts).not.toHaveBeenCalled();
    expect(state.listCitationsByArtifactIds).not.toHaveBeenCalled();
    expect(state.buildExportZipStream).not.toHaveBeenCalled();
  });

  it("returns 404 when project is missing", async () => {
    const GET = await loadRoute();
    state.getProjectByIdForUser.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost/api/export/proj"), {
      params: Promise.resolve({ projectId }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
    expect(state.requireAppUserApi).toHaveBeenCalledTimes(1);
    expect(state.getProjectByIdForUser).toHaveBeenCalledWith(projectId, "user");
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
    expect(state.getProjectByIdForUser).toHaveBeenCalledWith(projectId, "user");
    expect(state.listLatestArtifacts).toHaveBeenCalledWith(projectId, {
      limit: 500,
    });
    expect(state.listCitationsByArtifactIds).toHaveBeenCalledWith([]);
    expect(state.buildExportZipStream).toHaveBeenCalledTimes(1);
  });

  it("exports markdown and JSON artifacts and groups citations by artifact id", async () => {
    const GET = await loadRoute();

    state.listLatestArtifacts.mockResolvedValueOnce([
      {
        content: { format: "markdown", markdown: "# Hello", title: "Hi" },
        createdAt: now,
        id: "art_1",
        kind: "PRD",
        logicalKey: "PRD",
        projectId,
        runId: null,
        version: 1,
      },
      {
        content: { foo: "bar" },
        createdAt: now,
        id: "art_2",
        kind: "ARCH",
        logicalKey: "ARCH",
        projectId,
        runId: null,
        version: 3,
      },
    ] satisfies ArtifactDto[]);

    state.getMarkdownContent.mockImplementation((content: unknown) => {
      const value = content as Record<string, unknown>;
      if (value.format === "markdown" && typeof value.markdown === "string") {
        return {
          format: "markdown",
          markdown: value.markdown,
          title: typeof value.title === "string" ? value.title : "Untitled",
        };
      }
      return null;
    });

    state.listCitationsByArtifactIds.mockResolvedValueOnce([
      {
        artifactId: "art_1",
        createdAt: now,
        id: "cit_1",
        payload: { a: 1 },
        projectId,
        sourceRef: "https://example.com/a",
        sourceType: "web",
      },
      // This row should be ignored by the export grouping.
      {
        artifactId: null,
        createdAt: now,
        id: "cit_ignored",
        payload: {},
        projectId,
        sourceRef: "ignored",
        sourceType: "web",
      },
      {
        artifactId: "art_2",
        createdAt: now,
        id: "cit_2",
        payload: { b: 2 },
        projectId,
        sourceRef: "upload:1",
        sourceType: "upload",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/export/proj"), {
      params: Promise.resolve({ projectId }),
    });
    expect(res.status).toBe(200);

    expect(state.listCitationsByArtifactIds).toHaveBeenCalledWith([
      "art_1",
      "art_2",
    ]);
    expect(state.buildExportZipStream).toHaveBeenCalledTimes(1);

    const [call] = state.buildExportZipStream.mock.calls;
    const arg = (call?.[0] ?? {}) as {
      files?: Array<{ path: string; contentBytes: Uint8Array }>;
    };
    const files = arg.files ?? [];

    const prdMarkdown = files.find((f) => f.path === "artifacts/PRD/PRD.v1.md");
    expect(prdMarkdown).toBeTruthy();
    if (prdMarkdown) {
      const text = new TextDecoder().decode(prdMarkdown.contentBytes);
      expect(text).toContain("# Hello");
    }

    const archJson = files.find(
      (f) => f.path === "artifacts/ARCH/ARCH.v3.json",
    );
    expect(archJson).toBeTruthy();
    if (archJson) {
      const text = new TextDecoder().decode(archJson.contentBytes);
      expect(text).toContain('"foo": "bar"');
    }

    const prdCitations = files.find(
      (f) => f.path === "citations/PRD/PRD.v1.json",
    );
    expect(prdCitations).toBeTruthy();
    if (prdCitations) {
      const text = new TextDecoder().decode(prdCitations.contentBytes).trim();
      const parsed = JSON.parse(text) as unknown;
      expect(parsed).toEqual([
        {
          id: "cit_1",
          payload: { a: 1 },
          sourceRef: "https://example.com/a",
          sourceType: "web",
        },
      ]);
    }
  });
});
