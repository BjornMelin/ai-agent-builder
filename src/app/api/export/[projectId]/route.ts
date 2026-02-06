import { getMarkdownContent } from "@/lib/artifacts/content.server";
import { requireAppUserApi } from "@/lib/auth/require-app-user-api.server";
import { AppError } from "@/lib/core/errors";
import { listLatestArtifacts } from "@/lib/data/artifacts.server";
import { listCitationsByArtifactIds } from "@/lib/data/citations.server";
import { getProjectById } from "@/lib/data/projects.server";
import {
  artifactExportBasePath,
  buildExportZipStream,
} from "@/lib/export/zip.server";
import { jsonError } from "@/lib/next/responses";

function toUtf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Export a deterministic ZIP of the latest artifact versions (plus citations).
 *
 * @param _req - HTTP request.
 * @param context - Route params.
 * @returns ZIP response or JSON error.
 * @throws AppError - When the project cannot be found.
 */
export async function GET(
  _req: Request,
  context: Readonly<{ params: Promise<{ projectId: string }> }>,
): Promise<Response> {
  try {
    const paramsPromise = context.params;
    const authPromise = requireAppUserApi();
    const [params] = await Promise.all([paramsPromise, authPromise]);
    const { projectId } = params;

    const project = await getProjectById(projectId);
    if (!project) {
      throw new AppError("not_found", 404, "Project not found.");
    }

    const artifacts = await listLatestArtifacts(projectId, { limit: 500 });
    const citations = await listCitationsByArtifactIds(
      artifacts.map((a) => a.id),
    );

    const citationsByArtifactId = new Map<string, typeof citations>();
    for (const c of citations) {
      const artifactId = c.artifactId;
      if (!artifactId) continue;
      const existing = citationsByArtifactId.get(artifactId);
      if (existing) {
        existing.push(c);
        continue;
      }
      citationsByArtifactId.set(artifactId, [c]);
    }

    const files = artifacts.flatMap((a) => {
      const base = artifactExportBasePath({
        kind: a.kind,
        logicalKey: a.logicalKey,
        version: a.version,
      });

      const markdown = getMarkdownContent(a.content);
      const contentPath = markdown
        ? `artifacts/${base}.md`
        : `artifacts/${base}.json`;
      const contentBytes = markdown
        ? toUtf8Bytes(`${markdown.markdown}\n`)
        : toUtf8Bytes(`${JSON.stringify(a.content, null, 2)}\n`);

      const citationRows = citationsByArtifactId.get(a.id) ?? [];
      const citationsPath = `citations/${base}.json`;
      const citationsBytes = toUtf8Bytes(
        `${JSON.stringify(
          citationRows.map((c) => ({
            id: c.id,
            payload: c.payload,
            sourceRef: c.sourceRef,
            sourceType: c.sourceType,
          })),
          null,
          2,
        )}\n`,
      );

      return [
        { contentBytes, path: contentPath },
        { contentBytes: citationsBytes, path: citationsPath },
      ];
    });

    const { stream } = await buildExportZipStream({
      files,
      project: { id: project.id, name: project.name, slug: project.slug },
    });

    const filename = `project-${project.slug}-artifacts.zip`;
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/zip",
      },
      status: 200,
    });
  } catch (err) {
    return jsonError(err);
  }
}
