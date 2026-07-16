// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: (props: { children: ReactNode; open: boolean }) =>
    props.open ? <div>{props.children}</div> : null,
  DialogContent: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
  DialogDescription: (props: { children: ReactNode }) => (
    <p>{props.children}</p>
  ),
  DialogFooter: (props: { children: ReactNode }) => <div>{props.children}</div>,
  DialogHeader: (props: { children: ReactNode }) => <div>{props.children}</div>,
  DialogTitle: (props: { children: ReactNode }) => <h2>{props.children}</h2>,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ConfirmDialog", () => {
  it("submits its form from keyboard-equivalent form submission", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const { ConfirmDialog } = await import("@/components/ui/confirm-dialog");

    await act(async () => {
      root.render(
        <ConfirmDialog
          onConfirm={onConfirm}
          onOpenChange={onOpenChange}
          open
          title="Delete project?"
        >
          <input aria-label="Confirmation" />
        </ConfirmDialog>,
      );
    });

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not submit while exact confirmation is disabled", async () => {
    const onConfirm = vi.fn();
    const { ConfirmDialog } = await import("@/components/ui/confirm-dialog");

    await act(async () => {
      root.render(
        <ConfirmDialog
          confirmDisabled
          onConfirm={onConfirm}
          onOpenChange={vi.fn()}
          open
          title="Delete project?"
        />,
      );
    });

    const submit = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(submit?.disabled).toBe(true);

    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
