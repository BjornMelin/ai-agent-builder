"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useId, useState } from "react";
import { z } from "zod/mini";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const connectResponseSchema = z.looseObject({
  repo: z.optional(z.looseObject({ id: z.optional(z.string()) })),
});

const errorResponseSchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      code: z.optional(z.string()),
      message: z.optional(z.string()),
    }),
  ),
});

type RepoSummary = Readonly<{
  id: string;
  owner: string;
  name: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
}>;

/**
 * Repo connect form (client component).
 *
 * @param props - Props including projectId and current repo list.
 * @returns Repo connect form UI.
 */
export function RepoConnectClient(
  props: Readonly<{ projectId: string; initialRepos: readonly RepoSummary[] }>,
) {
  const router = useRouter();
  const ownerId = useId();
  const nameId = useId();
  const cloneUrlId = useId();
  const htmlUrlId = useId();
  const defaultBranchId = useId();
  const errorId = useId();

  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [htmlUrl, setHtmlUrl] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const hasRepo = props.initialRepos.length > 0;

  const connect = async () => {
    setIsPending(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name,
      owner,
      projectId: props.projectId,
      provider: "github",
    };

    if (cloneUrl.trim().length > 0) payload.cloneUrl = cloneUrl.trim();
    if (htmlUrl.trim().length > 0) payload.htmlUrl = htmlUrl.trim();
    if (defaultBranch.trim().length > 0)
      payload.defaultBranch = defaultBranch.trim();

    let res: Response;
    try {
      res = await fetch("/api/repos", {
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error ? err.message : "Failed to connect repo.");
      return;
    }

    if (!res.ok) {
      let message = `Failed to connect repo (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setIsPending(false);
      setError(message);
      return;
    }

    try {
      const jsonUnknown: unknown = await res.json();
      const parsed = connectResponseSchema.safeParse(jsonUnknown);
      if (!parsed.success) {
        throw new Error("Unexpected response from server.");
      }
    } catch (err) {
      setIsPending(false);
      setError(err instanceof Error ? err.message : "Failed to connect repo.");
      return;
    }

    setIsPending(false);
    setOwner("");
    setName("");
    setCloneUrl("");
    setHtmlUrl("");
    setDefaultBranch("");
    startTransition(() => router.refresh());
  };

  return (
    <form
      aria-describedby={error ? errorId : undefined}
      className="grid gap-4 rounded-xl border bg-muted/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <div className="space-y-1">
        <h3 className="font-medium text-sm">
          {hasRepo ? "Connect Another Repo" : "Connect a Repo"}
        </h3>
        <p className="text-muted-foreground text-sm">
          Provide `owner/name`. If GitHub API access is configured, clone URL
          and default branch are filled automatically.
        </p>
      </div>

      {error ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className="text-destructive text-sm"
          id={errorId}
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor={ownerId}>
            Owner
          </label>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            disabled={isPending}
            id={ownerId}
            name="owner"
            onChange={(e) => setOwner(e.target.value)}
            placeholder="vercel…"
            spellCheck={false}
            value={owner}
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor={nameId}>
            Repository
          </label>
          <Input
            autoCapitalize="none"
            autoComplete="off"
            disabled={isPending}
            id={nameId}
            name="repo"
            onChange={(e) => setName(e.target.value)}
            placeholder="next.js…"
            spellCheck={false}
            value={name}
          />
        </div>
      </div>

      <details className="rounded-lg border bg-background p-3">
        <summary className="cursor-pointer select-none rounded-md text-muted-foreground text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          Manual connection fields (optional)
        </summary>
        <div className="mt-3 grid gap-4">
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor={cloneUrlId}>
              Clone URL
            </label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              disabled={isPending}
              id={cloneUrlId}
              inputMode="url"
              name="cloneUrl"
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git…"
              spellCheck={false}
              type="url"
              value={cloneUrl}
            />
          </div>
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor={htmlUrlId}>
              HTML URL
            </label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              disabled={isPending}
              id={htmlUrlId}
              inputMode="url"
              name="htmlUrl"
              onChange={(e) => setHtmlUrl(e.target.value)}
              placeholder="https://github.com/owner/repo…"
              spellCheck={false}
              type="url"
              value={htmlUrl}
            />
          </div>
          <div className="grid gap-2">
            <label className="font-medium text-sm" htmlFor={defaultBranchId}>
              Default branch
            </label>
            <Input
              autoCapitalize="none"
              autoComplete="off"
              disabled={isPending}
              id={defaultBranchId}
              name="defaultBranch"
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder="main…"
              spellCheck={false}
              value={defaultBranch}
            />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-end gap-2">
        <Button
          aria-busy={isPending}
          disabled={isPending}
          type="submit"
          variant="secondary"
        >
          {isPending ? (
            <Loader2Icon
              aria-hidden="true"
              className="size-4 motion-safe:animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {isPending ? "Connecting…" : "Connect Repo"}
        </Button>
      </div>
    </form>
  );
}
