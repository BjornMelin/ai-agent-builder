"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { uploadProjectFilesFromFiles } from "@/lib/uploads/upload-files.client";

/**
 * Upload form that uses Vercel Blob client uploads via the `/api/upload` token route.
 *
 * @param props - Upload props containing the destination `projectId`.
 * @returns The upload form.
 */
export function UploadClient(props: Readonly<{ projectId: string }>) {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [asyncIngest, setAsyncIngest] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const ingestToggleId = "uploads-async-ingest";
  const fileHelpId = "uploads-file-help";
  const fileInputId = "uploads-file-input";
  const statusMessageId = "uploads-status-message";
  const errorMessageId = "uploads-error-message";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!files || files.length === 0) {
      setError("Select at least one file.");
      setStatus("error");
      return;
    }

    setStatus("uploading");

    try {
      await uploadProjectFilesFromFiles({
        asyncIngest,
        files: Array.from(files),
        projectId: props.projectId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      setStatus("error");
      setError(message);
      return;
    }

    setStatus("success");
    setFiles(null);
    setInputKey((currentKey) => currentKey + 1);

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <label className="font-medium text-sm" htmlFor={fileInputId}>
          Files
        </label>
        <Input
          aria-describedby={
            error
              ? `${fileHelpId} ${statusMessageId} ${errorMessageId}`
              : `${fileHelpId} ${statusMessageId}`
          }
          aria-invalid={status === "error"}
          id={fileInputId}
          key={inputKey}
          multiple
          name="file"
          onChange={(e) => setFiles(e.currentTarget.files)}
          type="file"
        />
        <p className="text-muted-foreground text-xs" id={fileHelpId}>
          Supported formats depend on ingestion pipelines configured on the
          server.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={asyncIngest}
            id={ingestToggleId}
            onCheckedChange={setAsyncIngest}
          />
          <label className="text-sm" htmlFor={ingestToggleId}>
            Async ingest
          </label>
        </div>

        <Button
          aria-busy={status === "uploading"}
          className="min-w-24"
          disabled={status === "uploading"}
          type="submit"
        >
          {status === "uploading" ? (
            <span
              aria-hidden="true"
              className="size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
            />
          ) : null}
          <span>Upload</span>
        </Button>
      </div>

      <output aria-live="polite" className="sr-only" id={statusMessageId}>
        {status === "uploading"
          ? "Uploading selected files…"
          : status === "success"
            ? "Upload complete."
            : ""}
      </output>

      {status === "success" ? (
        <output aria-live="polite" className="text-sm text-foreground">
          Upload complete.
        </output>
      ) : null}

      {error ? (
        <p
          className="text-destructive text-sm"
          id={errorMessageId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
