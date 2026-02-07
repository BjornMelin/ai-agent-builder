import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProjectFileById } from "@/lib/data/files.server";

/**
 * Upload detail content (suspends for request-time data).
 *
 * @param props - `{ params: { projectId: string; fileId: string } }` route parameters where `projectId` and `fileId` are non-empty, URL-safe string identifiers used to load the upload detail.
 * @returns The upload detail UI.
 */
export async function UploadDetailContent(
  props: Readonly<{
    projectId: string;
    fileId: string;
  }>,
) {
  const { projectId, fileId } = props;
  const file = await getProjectFileById(fileId, projectId);

  if (!file || file.projectId !== projectId) notFound();

  const mimeType = file.mimeType.trim().length > 0 ? file.mimeType : "unknown";
  const sha256 = file.sha256.trim().length > 0 ? file.sha256 : "unavailable";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{file.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="text-sm">
            <p className="text-muted-foreground">MIME type</p>
            <p className="font-medium">{mimeType}</p>
          </div>
          <Separator />
          <div className="text-sm">
            <p className="text-muted-foreground">Storage</p>
            <a
              className="break-all underline-offset-4 hover:underline"
              href={file.storageKey}
              rel="noreferrer"
              target="_blank"
            >
              {file.storageKey}
            </a>
          </div>
          <Separator />
          <div className="text-sm">
            <p className="text-muted-foreground">SHA-256</p>
            <p className="break-all font-mono text-xs">{sha256}</p>
          </div>
        </CardContent>
      </Card>

      <Link
        aria-label="Back to uploads"
        className="text-sm underline-offset-4 hover:underline"
        href={`/projects/${encodeURIComponent(projectId)}/uploads`}
      >
        ← Back to uploads
      </Link>
    </div>
  );
}
