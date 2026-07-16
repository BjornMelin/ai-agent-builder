"use client";

import { ArchiveRestoreIcon, ArchiveXIcon, Trash2Icon } from "lucide-react";
import { useActionState, useState } from "react";

import {
  deleteProjectAction,
  projectLifecycleInitialState,
  setProjectStatusAction,
  updateProjectAction,
} from "@/app/(app)/projects/[projectId]/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import type { ProjectDto } from "@/lib/data/projects.server";

function ActionMessage(
  props: Readonly<{
    state: typeof projectLifecycleInitialState;
    id: string;
  }>,
) {
  if (props.state.status === "idle") return null;
  return (
    <p
      className={
        props.state.status === "error"
          ? "text-destructive text-sm"
          : "text-muted-foreground text-sm"
      }
      id={props.id}
      role={props.state.status === "error" ? "alert" : "status"}
    >
      {props.state.message}
    </p>
  );
}

/**
 * Project metadata, archive, restore, and guarded deletion controls.
 *
 * @param props - Current project state.
 * @returns Project lifecycle settings UI.
 */
export function ProjectLifecycleSettings(
  props: Readonly<{
    canManage: boolean;
    deletionReady: boolean;
    deletionUnavailableReason?: string;
    project: ProjectDto;
    retainsManagedResources: boolean;
  }>,
) {
  const { project } = props;
  const [updateState, updateAction, isUpdating] = useActionState(
    updateProjectAction,
    projectLifecycleInitialState,
  );
  const [statusState, statusAction, isChangingStatus] = useActionState(
    setProjectStatusAction,
    projectLifecycleInitialState,
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const isArchived = project.status === "archived";
  const isDeleting = project.status === "deleting";
  const canEdit = props.canManage && !isDeleting;
  const canDelete =
    props.canManage && props.deletionReady && (isArchived || isDeleting);
  const deletionReason = !props.canManage
    ? props.deletionUnavailableReason
    : !isArchived && !isDeleting
      ? "Archive the project before permanent deletion."
      : props.deletionUnavailableReason;
  const statusLabel = isDeleting
    ? "Deletion pending"
    : isArchived
      ? "Archived"
      : "Active";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Project details</CardTitle>
            <Badge variant={isArchived || isDeleting ? "outline" : "secondary"}>
              {statusLabel}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form
            action={updateAction}
            aria-describedby={
              updateState.status === "idle"
                ? undefined
                : "project-update-message"
            }
            className="flex flex-col gap-4"
          >
            <input name="projectId" type="hidden" value={project.id} />
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="project-name">
                Name
              </label>
              <Input
                defaultValue={project.name}
                disabled={isUpdating || !canEdit}
                id="project-name"
                maxLength={256}
                name="name"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="project-slug">
                Slug
              </label>
              <Input
                autoCapitalize="none"
                autoCorrect="off"
                defaultValue={project.slug}
                aria-describedby="project-slug-help"
                disabled={isUpdating || !canEdit}
                id="project-slug"
                maxLength={128}
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                spellCheck={false}
              />
              <p
                className="text-muted-foreground text-xs"
                id="project-slug-help"
              >
                Lowercase letters, numbers, and single dashes.
              </p>
            </div>
            <ActionMessage id="project-update-message" state={updateState} />
            <Button
              aria-busy={isUpdating || undefined}
              className="self-start"
              disabled={isUpdating || !canEdit}
              type="submit"
            >
              {isUpdating ? "Saving…" : "Save changes"}
            </Button>
          </form>
          {!props.canManage ? (
            <p className="mt-4 text-muted-foreground text-sm" role="status">
              This legacy project is read-only until ownership is backfilled.
            </p>
          ) : isDeleting ? (
            <p className="mt-4 text-muted-foreground text-sm" role="status">
              Deletion is pending. Project details are locked while cleanup is
              retryable.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {isDeleting
                  ? "Deletion pending"
                  : isArchived
                    ? "Restore project"
                    : "Archive project"}
              </p>
              <p className="text-muted-foreground text-sm">
                {isDeleting
                  ? "This irreversible state cannot be restored. Retry cleanup below."
                  : isArchived
                    ? "Return this workspace to active status."
                    : "Keep the workspace readable while preventing new work."}
              </p>
            </div>
            <form
              action={statusAction}
              aria-describedby={
                statusState.status === "idle"
                  ? undefined
                  : "project-status-message"
              }
            >
              <input name="projectId" type="hidden" value={project.id} />
              <input
                name="status"
                type="hidden"
                value={isArchived ? "active" : "archived"}
              />
              <Button
                aria-busy={isChangingStatus || undefined}
                disabled={isChangingStatus || !canEdit}
                type="submit"
                variant="outline"
              >
                {isArchived ? (
                  <ArchiveRestoreIcon aria-hidden="true" />
                ) : (
                  <ArchiveXIcon aria-hidden="true" />
                )}
                {isChangingStatus
                  ? "Updating…"
                  : isDeleting
                    ? "Deletion pending"
                    : isArchived
                      ? "Restore project"
                      : "Archive project"}
              </Button>
            </form>
            <ActionMessage id="project-status-message" state={statusState} />
          </div>

          <div className="border-t pt-5">
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <p className="font-medium text-sm">Delete project</p>
                <p className="text-muted-foreground text-sm">
                  Permanently removes the database records, uploads, sandbox
                  transcripts, and vector indexes owned by this project.
                </p>
                {props.retainsManagedResources ? (
                  <p className="text-amber-700 text-sm dark:text-amber-300">
                    External Neon, Upstash, or Vercel resources are not
                    decommissioned. Their non-secret provider records remain as
                    detached cleanup provenance after this project is deleted.
                  </p>
                ) : null}
              </div>
              <Button
                aria-describedby={
                  deletionReason ? "delete-project-reason" : undefined
                }
                aria-disabled={!canDelete}
                className="self-start aria-disabled:pointer-events-none aria-disabled:opacity-50"
                onClick={() => {
                  if (!canDelete) return;
                  setDeleteError(undefined);
                  setDeleteOpen(true);
                }}
                type="button"
                variant="destructive"
              >
                <Trash2Icon aria-hidden="true" />
                {isDeleting ? "Retry deletion" : "Delete project"}
              </Button>
              {deletionReason ? (
                <p
                  className="text-muted-foreground text-xs"
                  id="delete-project-reason"
                >
                  {deletionReason}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        confirmDisabled={confirmation !== project.slug}
        confirmLabel={isDeleting ? "Retry deletion" : "Delete permanently"}
        description={
          props.retainsManagedResources
            ? "This cannot be undone. External provider resources remain live; their records are retained for later cleanup."
            : "This cannot be undone. Active runs, chats, or sandboxes must be finished first."
        }
        dialogError={deleteError}
        onConfirm={async () => {
          setDeleteError(undefined);
          const result = await deleteProjectAction({
            confirmation,
            projectId: project.id,
          });
          if (result.status === "error") {
            setDeleteError(result.message);
            throw new Error(result.message);
          }
        }}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setConfirmation("");
            setDeleteError(undefined);
          }
        }}
        open={deleteOpen}
        title={`Delete ${project.name}?`}
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm" htmlFor="delete-project-confirmation">
            Type <strong>{project.slug}</strong> to confirm
          </label>
          <Input
            aria-describedby="delete-project-confirmation-help"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            id="delete-project-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            spellCheck={false}
            value={confirmation}
          />
          <p
            className="text-muted-foreground text-xs"
            id="delete-project-confirmation-help"
          >
            The value must match the project slug exactly.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
