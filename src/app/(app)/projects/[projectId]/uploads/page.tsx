import Link from "next/link";
import { UploadClient } from "@/app/(app)/projects/[projectId]/uploads/upload-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectFiles } from "@/lib/data/files.server";

/**
 * Uploads tab.
 *
 * @param props - Route params.
 * @returns The uploads page.
 */
export default async function UploadsPage(
  props: Readonly<{ params: Promise<{ projectId: string }> }>,
) {
  const { projectId } = await props.params;
  const files = await listProjectFiles(projectId, { limit: 50 });
  const fileSizeFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
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
            <p className="text-muted-foreground text-sm">
              No files uploaded yet.
            </p>
          ) : (
            <ul
              className="grid gap-2"
              style={{
                containIntrinsicSize: "auto 200px",
                contentVisibility: "auto",
              }}
            >
              {files.map((file) => (
                <li key={file.id}>
                  <Link
                    className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-muted/50"
                    href={`/projects/${projectId}/uploads/${file.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="truncate text-muted-foreground text-sm">
                        {file.mimeType} ·{" "}
                        {fileSizeFormatter.format(file.sizeBytes / 1024)}
                        {"\u00A0"}KB
                      </p>
                    </div>
                    <span className="text-muted-foreground text-sm">Open</span>
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
