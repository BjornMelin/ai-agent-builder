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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
