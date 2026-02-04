"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type UploadResponse = Readonly<{
  files: readonly Readonly<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }>[];
}>;

/**
 * Upload form that posts to the `/api/upload` route handler.
 *
 * @param props - Component props.
 * @returns The upload form.
 */
export function UploadClient(props: Readonly<{ projectId: string }>) {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [asyncIngest, setAsyncIngest] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const ingestToggleId = "uploads-async-ingest";
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

    const form = new FormData();
    form.append("projectId", props.projectId);
    if (asyncIngest) {
      form.append("async", "true");
    }
    for (const file of Array.from(files)) {
      form.append("file", file);
    }

    const res = await fetch("/api/upload", {
      body: form,
      method: "POST",
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      const message =
        payload?.error?.message ?? `Upload failed (HTTP ${res.status}).`;
      setError(message);
      setStatus("error");
      return;
    }

    // Best-effort parse (useful for debugging); UI refresh is the real update.
    await res.json().catch(() => null as unknown as UploadResponse);

    setStatus("success");
    setFiles(null);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="sr-only" htmlFor={fileInputId}>
          Select files to upload
        </label>
        <Input
          aria-describedby={
            error ? `${statusMessageId} ${errorMessageId}` : statusMessageId
          }
          aria-invalid={status === "error"}
          id={fileInputId}
          multiple
          onChange={(e) => setFiles(e.currentTarget.files)}
          type="file"
        />

        <Button disabled={status === "uploading"} type="submit">
          {status === "uploading" ? "Uploading…" : "Upload"}
        </Button>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Switch
          checked={asyncIngest}
          id={ingestToggleId}
          onCheckedChange={(checked) => setAsyncIngest(checked)}
        />
        <label className="text-muted-foreground" htmlFor={ingestToggleId}>
          Async ingest (QStash) {asyncIngest ? "enabled" : "disabled"}
        </label>
      </div>

      <output aria-live="polite" className="sr-only" id={statusMessageId}>
        {status === "uploading"
          ? "Uploading selected files."
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
