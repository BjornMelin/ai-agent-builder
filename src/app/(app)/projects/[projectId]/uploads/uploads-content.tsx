import Link from "next/link";

import { UploadClient } from "@/app/(app)/projects/[projectId]/uploads/upload-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { listProjectFiles } from "@/lib/data/files.server";

function formatBytes(
  bytes: number,
  formatter: Intl.NumberFormat,
): `${string}\u00A0${string}` {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return `0\u00A0B`;
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** exponent;
  return `${formatter.format(value)}\u00A0${units[exponent]}`;
}

/**
 * Uploads tab content (suspends for request-time data).
 *
 * @param props - Component props including the target project identifier (`projectId`).
 * @returns Uploads page content.
 */
export async function UploadsContent(
  props: Readonly<{
    projectId: string;
  }>,
) {
  const { projectId } = props;

  const files = await listProjectFiles(projectId, { limit: 50 });
  const fileSizeFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

  return (
    <div className="flex flex-col gap-5">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Upload files</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadClient projectId={projectId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent uploads</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <Empty className="min-h-[160px] rounded-xl border">
              <EmptyHeader>
                <EmptyTitle>No files uploaded yet</EmptyTitle>
                <EmptyDescription>
                  Add files above to start ingestion and project search.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul
              className="grid gap-2"
              style={{
                containIntrinsicSize: "auto 220px",
                contentVisibility: "auto",
              }}
            >
              {files.map((file) => (
                <li key={file.id}>
                  <Link
                    className="group flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
                    href={`/projects/${encodeURIComponent(
                      projectId,
                    )}/uploads/${encodeURIComponent(file.id)}`}
                    prefetch={false}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="truncate text-muted-foreground text-sm">
                        {file.mimeType} ·{" "}
                        {formatBytes(file.sizeBytes, fileSizeFormatter)}
                      </p>
                    </div>
                    <span className="text-muted-foreground text-sm transition-colors group-hover:text-foreground">
                      Open
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
