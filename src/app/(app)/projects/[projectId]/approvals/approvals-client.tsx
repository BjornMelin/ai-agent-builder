"use client";

import { useRouter } from "next/navigation";
import { startTransition, useId, useState } from "react";
import { z } from "zod/mini";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const approvalsResponseSchema = z.looseObject({
  approvals: z.optional(z.array(z.unknown())),
});

const errorResponseSchema = z.looseObject({
  error: z.optional(
    z.looseObject({
      code: z.optional(z.string()),
      message: z.optional(z.string()),
    }),
  ),
});

type ApprovalSummary = Readonly<{
  id: string;
  scope: string;
  intentSummary: string;
  createdAt: string;
  runId: string;
}>;

function isApprovalSummary(value: unknown): value is ApprovalSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ApprovalSummary>;
  return (
    typeof v.id === "string" &&
    typeof v.scope === "string" &&
    typeof v.intentSummary === "string" &&
    typeof v.createdAt === "string" &&
    typeof v.runId === "string"
  );
}

const createdAtFormatterUtc = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

function formatCreatedAtUtc(isoString: string): string {
  if (!isoString || typeof isoString !== "string") return "";
  const parsed = new Date(isoString);
  return Number.isNaN(parsed.valueOf())
    ? isoString
    : createdAtFormatterUtc.format(parsed);
}

/**
 * Approvals list + approve controls (client component).
 *
 * @param props - Component props.
 * @returns Approvals UI.
 */
export function ApprovalsClient(
  props: Readonly<{
    projectId: string;
    initialApprovals: readonly ApprovalSummary[];
  }>,
) {
  const router = useRouter();
  const errorId = useId();
  const [approvals, setApprovals] = useState<readonly ApprovalSummary[]>(
    () => props.initialApprovals,
  );
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ApprovalSummary | null>(null);

  const refresh = async () => {
    setIsRefreshing(true);
    setError(null);

    let res: Response;
    try {
      const url = new URL("/api/approvals", window.location.origin);
      url.searchParams.set("projectId", props.projectId);
      res = await fetch(url.toString(), { method: "GET" });
    } catch (err) {
      setIsRefreshing(false);
      setError(
        err instanceof Error ? err.message : "Failed to refresh approvals.",
      );
      return;
    }

    if (!res.ok) {
      let message = `Failed to refresh approvals (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setIsRefreshing(false);
      setError(message);
      return;
    }

    try {
      const jsonUnknown: unknown = await res.json();
      const parsed = approvalsResponseSchema.safeParse(jsonUnknown);
      const list = parsed.success ? parsed.data.approvals : null;
      const next =
        list && Array.isArray(list)
          ? list.filter(isApprovalSummary)
          : props.initialApprovals;
      setApprovals(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse approvals.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const approve = async (approvalId: string): Promise<boolean> => {
    setApprovingId(approvalId);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/approvals", {
        body: JSON.stringify({ approvalId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch (err) {
      setApprovingId(null);
      setError(err instanceof Error ? err.message : "Failed to approve.");
      return false;
    }

    if (!res.ok) {
      let message = `Failed to approve (${res.status}).`;
      try {
        const jsonUnknown: unknown = await res.json();
        const parsed = errorResponseSchema.safeParse(jsonUnknown);
        const fromServer = parsed.success ? parsed.data.error?.message : null;
        if (fromServer) message = fromServer;
      } catch {
        // Ignore.
      }
      setApprovingId(null);
      setError(message);
      return false;
    }

    setApprovingId(null);
    setApprovals((prev) => prev.filter((a) => a.id !== approvalId));
    startTransition(() => router.refresh());
    return true;
  };

  if (approvals.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={isRefreshing}
            onClick={() => void refresh()}
            size="sm"
            type="button"
            variant="secondary"
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        <Empty className="min-h-[180px] rounded-xl border">
          <EmptyHeader>
            <EmptyTitle>No pending approvals</EmptyTitle>
            <EmptyDescription>
              Approval gates for merges, provisioning, and production deploys
              will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div aria-describedby={error ? errorId : undefined} className="space-y-4">
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Pending approvals:{" "}
          <span className="font-medium">{approvals.length}</span>
        </p>
        <Button
          disabled={isRefreshing}
          onClick={() => void refresh()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <ul className="grid gap-2">
        {approvals.map((approval) => (
          <li key={approval.id}>
            <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium">{approval.intentSummary}</p>
                <p className="truncate text-muted-foreground text-sm">
                  Scope: <span className="font-mono">{approval.scope}</span> ·
                  Run <span className="font-mono">{approval.runId}</span>
                </p>
                <p className="text-muted-foreground text-sm">
                  Requested{" "}
                  <time dateTime={approval.createdAt}>
                    {formatCreatedAtUtc(approval.createdAt)}
                  </time>
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                <Button
                  disabled={approvingId !== null}
                  onClick={() => setConfirming(approval)}
                  size="sm"
                  type="button"
                >
                  Approve
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        open={confirming !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              Approve this request to allow the run to proceed. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>

          {confirming ? (
            <div className="grid gap-2 text-sm">
              <p className="min-w-0 truncate">
                <span className="font-medium">Summary:</span>{" "}
                {confirming.intentSummary}
              </p>
              <p className="min-w-0 truncate text-muted-foreground">
                <span className="font-medium text-foreground">Scope:</span>{" "}
                <span className="font-mono">{confirming.scope}</span>
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              disabled={approvingId !== null}
              onClick={() => setConfirming(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              aria-busy={confirming ? approvingId === confirming.id : undefined}
              disabled={confirming ? approvingId !== null : true}
              onClick={async () => {
                if (!confirming) return;
                const ok = await approve(confirming.id);
                if (ok) setConfirming(null);
              }}
              type="button"
              variant="destructive"
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
