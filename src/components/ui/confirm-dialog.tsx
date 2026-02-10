"use client";

import type { ComponentProps } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Props for {@link ConfirmDialog}.
 */
export type ConfirmDialogProps = Readonly<{
  /**
   * Whether the dialog is open.
   */
  open: boolean;
  /**
   * Called when the dialog open state changes.
   */
  onOpenChange: (open: boolean) => void;
  /**
   * Dialog title.
   */
  title: string;
  /**
   * Optional description shown under the title.
   */
  description?: string;
  /**
   * Optional error message shown inside the dialog.
   *
   * @remarks
   * This is useful when an async {@link ConfirmDialogProps.onConfirm} fails and
   * the dialog should remain open while showing an actionable error to the user.
   */
  dialogError?: string;
  /**
   * Confirm button label.
   *
   * @defaultValue "Confirm"
   */
  confirmLabel?: string;
  /**
   * Cancel button label.
   *
   * @defaultValue "Cancel"
   */
  cancelLabel?: string;
  /**
   * Confirm button variant.
   *
   * @defaultValue "destructive"
   */
  confirmVariant?: ComponentProps<typeof Button>["variant"];
  /**
   * Whether the confirm action is disabled.
   */
  confirmDisabled?: boolean;
  /**
   * Called when the user confirms.
   *
   * @remarks
   * If this throws or rejects, the dialog stays open.
   */
  onConfirm: () => void | Promise<void>;
}>;

/**
 * Accessible, reusable confirm dialog using the app's Dialog + Button primitives.
 *
 * @param props - Dialog props.
 * @returns Confirm dialog UI.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    dialogError,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    confirmVariant = "destructive",
    confirmDisabled = false,
    onConfirm,
  } = props;

  const [isConfirming, setIsConfirming] = useState(false);
  const canConfirm = !confirmDisabled && !isConfirming;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isConfirming) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {dialogError ? (
          <p className="text-destructive text-sm" role="alert">
            {dialogError}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={isConfirming}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button
            aria-busy={isConfirming || undefined}
            disabled={!canConfirm}
            onClick={async () => {
              if (!canConfirm) return;
              setIsConfirming(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } catch {
                // Keep dialog open on failure.
              } finally {
                setIsConfirming(false);
              }
            }}
            type="button"
            variant={confirmVariant}
          >
            {isConfirming ? (
              <span
                aria-hidden="true"
                className="mr-2 size-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
