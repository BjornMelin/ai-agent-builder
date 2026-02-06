import {
  BookTextIcon,
  BoxesIcon,
  MessageSquareTextIcon,
  PlayCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAppUser } from "@/lib/auth/require-app-user";
import { getLatestChatThreadByProjectId } from "@/lib/data/chat.server";
import {
  getProjectArtifactOverview,
  getProjectCorpusOverview,
  getProjectRunOverview,
} from "@/lib/data/project-overview.server";
import { getProjectByIdForUser } from "@/lib/data/projects.server";

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[idx]}`;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const ms = new Date(iso).getTime();
  const diffMs = ms - now;
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absSeconds < 60) return rtf.format(diffSeconds, "second");

  const diffMinutes = Math.round(diffSeconds / 60);
  const absMinutes = Math.abs(diffMinutes);
  if (absMinutes < 60) return rtf.format(diffMinutes, "minute");

  const diffHours = Math.round(diffMinutes / 60);
  const absHours = Math.abs(diffHours);
  if (absHours < 48) return rtf.format(diffHours, "hour");

  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function formatRunStatus(status: string): string {
  return status.replaceAll("-", " ");
}

/**
 * Project overview content (suspends for request-time data).
 *
 * @param props - Route params.
 * @returns The project overview UI.
 */
export async function ProjectOverviewContent(
  props: Readonly<{
    projectId: string;
  }>,
) {
  const { projectId } = props;
  const user = await requireAppUser();

  const [project, corpus, runs, artifacts, latestThread] = await Promise.all([
    getProjectByIdForUser(projectId, user.id),
    getProjectCorpusOverview(projectId),
    getProjectRunOverview(projectId),
    getProjectArtifactOverview(projectId),
    getLatestChatThreadByProjectId(projectId),
  ]);

  if (!project) {
    // Layout handles notFound; keep this as a defensive fallback.
    return null;
  }

  const indexedCoverage =
    corpus.totalFiles > 0 ? corpus.indexedFiles / corpus.totalFiles : 0;
  const corpusBadge =
    corpus.totalFiles === 0
      ? { label: "Empty", variant: "outline" as const }
      : indexedCoverage >= 0.95 && corpus.indexedChunks > 0
        ? { label: "Ready", variant: "secondary" as const }
        : { label: "Indexing", variant: "outline" as const };

  const needsAttention = runs.statusCounts.blocked + runs.statusCounts.waiting;
  const runBadge =
    needsAttention > 0
      ? { label: "Attention", variant: "destructive" as const }
      : runs.statusCounts.running > 0
        ? { label: "Active", variant: "secondary" as const }
        : { label: "Idle", variant: "outline" as const };

  const artifactsBadge =
    artifacts.latestKeys > 0
      ? { label: "Available", variant: "secondary" as const }
      : { label: "None", variant: "outline" as const };

  const chatBadge = latestThread
    ? latestThread.status === "running"
      ? { label: "Active", variant: "secondary" as const }
      : latestThread.status === "blocked"
        ? { label: "Blocked", variant: "destructive" as const }
        : {
            label: formatRunStatus(latestThread.status),
            variant: "outline" as const,
          }
    : { label: "No threads", variant: "outline" as const };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="group overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted/40">
                <BookTextIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">Knowledge base</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Uploads and indexed chunks
                </p>
              </div>
            </div>
            <Badge variant={corpusBadge.variant}>{corpusBadge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-semibold text-2xl tabular-nums">
              {corpus.indexedFiles}/{corpus.totalFiles} indexed
            </p>
            <p className="text-muted-foreground text-sm">
              {corpus.indexedChunks.toLocaleString()} chunks
              {corpus.totalBytes > 0
                ? ` · ${formatBytes(corpus.totalBytes)}`
                : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
            <span>
              Latest upload:{" "}
              {corpus.lastUploadAt
                ? formatRelativeTime(corpus.lastUploadAt)
                : "never"}
            </span>
            <Link
              className="underline-offset-4 hover:underline"
              href={`/projects/${encodeURIComponent(projectId)}/uploads`}
              prefetch={false}
            >
              Manage uploads
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="group overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted/40">
                {needsAttention > 0 ? (
                  <TriangleAlertIcon className="size-4 text-muted-foreground" />
                ) : (
                  <PlayCircleIcon className="size-4 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">Runs</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Activity and pipeline status
                </p>
              </div>
            </div>
            <Badge variant={runBadge.variant}>{runBadge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-semibold text-2xl tabular-nums">
              {runs.statusCounts.running + runs.statusCounts.pending} active
            </p>
            <p className="text-muted-foreground text-sm">
              {needsAttention > 0
                ? `${needsAttention} need attention`
                : runs.totalRuns > 0
                  ? `${runs.totalRuns} total`
                  : "No runs yet"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
            <span>
              Last run:{" "}
              {runs.lastRun
                ? `${formatRunStatus(runs.lastRun.status)} · ${formatRelativeTime(
                    runs.lastRun.createdAt,
                  )}`
                : "never"}
            </span>
            <Link
              className="underline-offset-4 hover:underline"
              href={`/projects/${encodeURIComponent(projectId)}/runs`}
              prefetch={false}
            >
              View runs
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="group overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted/40">
                <BoxesIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">Artifacts</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Latest outputs and docs
                </p>
              </div>
            </div>
            <Badge variant={artifactsBadge.variant}>
              {artifactsBadge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-semibold text-2xl tabular-nums">
              {artifacts.latestKeys.toLocaleString()} keys
            </p>
            <p className="text-muted-foreground text-sm">
              {artifacts.lastArtifact
                ? `${artifacts.lastArtifact.kind} · ${formatRelativeTime(
                    artifacts.lastArtifact.createdAt,
                  )}`
                : "No artifacts yet"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
            <span className="truncate">
              Latest:{" "}
              {artifacts.lastArtifact
                ? `${artifacts.lastArtifact.logicalKey} · v${artifacts.lastArtifact.version}`
                : "n/a"}
            </span>
            <Link
              className="underline-offset-4 hover:underline"
              href={`/projects/${encodeURIComponent(projectId)}/artifacts`}
              prefetch={false}
            >
              Browse artifacts
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="group overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted/40">
                <MessageSquareTextIcon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">Chat</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Questions grounded in your data
                </p>
              </div>
            </div>
            <Badge variant={chatBadge.variant}>{chatBadge.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-semibold text-lg">
              {latestThread ? latestThread.title : "Start a new thread"}
            </p>
            <p className="text-muted-foreground text-sm">
              {latestThread
                ? `Last activity ${formatRelativeTime(latestThread.lastActivityAt)}`
                : "No chat history yet"}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-sm">
            <span className="truncate">
              {latestThread
                ? `Status: ${formatRunStatus(latestThread.status)}`
                : " "}
            </span>
            <Link
              className="underline-offset-4 hover:underline"
              href={`/projects/${encodeURIComponent(projectId)}/chat`}
              prefetch={false}
            >
              Open chat
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
