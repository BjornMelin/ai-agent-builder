"use client";

import { useRouter } from "next/navigation";
import { type SubmitEvent, startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/**
 * Upload form that posts to the `/api/upload` route handler.
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
  const fileInputId = "uploads-file-input";
  const statusMessageId = "uploads-status-message";
  const errorMessageId = "uploads-error-message";

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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

    let res: Response;
    try {
      res = await fetch("/api/upload", {
        body: form,
        method: "POST",
      });
    } catch {
      setError("Network error while uploading. Please try again.");
      setStatus("error");
      return;
    }

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      const message =
        payload?.error?.message ?? `Upload failed (HTTP ${res.status}).`;
      setError(message);
      setStatus("error");
      return;
    }

    // Best-effort parse (useful for debugging); UI refresh is the real update.
    await res.json().catch(() => null);

    setStatus("success");
    setFiles(null);
    setInputKey((currentKey) => currentKey + 1);

    startTransition(() => {
      router.refresh();
    });
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
          key={inputKey}
          multiple
          name="files"
          onChange={(e) => setFiles(e.currentTarget.files)}
          type="file"
        />

        <Button
          aria-busy={status === "uploading"}
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

      <div className="flex items-center gap-3 text-sm">
        <Switch
          checked={asyncIngest}
          id={ingestToggleId}
          onCheckedChange={setAsyncIngest}
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
