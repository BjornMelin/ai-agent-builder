// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDto } from "@/lib/data/projects.server";

const state = vi.hoisted(() => ({
  deleteProjectAction: vi.fn(),
  setProjectStatusAction: vi.fn(),
  updateProjectAction: vi.fn(),
}));

vi.mock("@/app/(app)/projects/[projectId]/settings/actions", () => ({
  deleteProjectAction: state.deleteProjectAction,
  projectLifecycleInitialState: { status: "idle" },
  setProjectStatusAction: state.setProjectStatusAction,
  updateProjectAction: state.updateProjectAction,
}));

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

const baseProject = {
  createdAt: new Date(0).toISOString(),
  id: "proj_1",
  name: "Project",
  slug: "project",
  status: "archived" as const,
  updatedAt: new Date(0).toISOString(),
} satisfies ProjectDto;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  state.deleteProjectAction.mockResolvedValue({
    message: "Deleted.",
    status: "success",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderLifecycle(
  overrides: Partial<{
    deletionReady: boolean;
    deletionUnavailableReason: string;
    project: ProjectDto;
    retainsManagedResources: boolean;
  }> = {},
) {
  const { ProjectLifecycleSettings } = await import(
    "@/app/(app)/projects/[projectId]/settings/project-lifecycle-settings"
  );
  await act(async () => {
    root.render(
      <ProjectLifecycleSettings
        canManage
        deletionReady={overrides.deletionReady ?? true}
        project={overrides.project ?? baseProject}
        retainsManagedResources={overrides.retainsManagedResources ?? false}
        {...(overrides.deletionUnavailableReason
          ? {
              deletionUnavailableReason: overrides.deletionUnavailableReason,
            }
          : {})}
      />,
    );
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

describe("ProjectLifecycleSettings", () => {
  it("requires an exact slug before enabling permanent deletion", async () => {
    await renderLifecycle();
    await act(async () => findButton("Delete project").click());

    const input = container.querySelector<HTMLInputElement>(
      "#delete-project-confirmation",
    );
    if (!input) throw new Error("Missing confirmation input.");
    const confirm = findButton("Delete permanently");
    expect(confirm.disabled).toBe(true);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "project");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(confirm.disabled).toBe(false);
    await act(async () => {
      confirm
        .closest("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(state.deleteProjectAction).toHaveBeenCalledWith({
      confirmation: "project",
      projectId: "proj_1",
    });
  });

  it("keeps unavailable deletion reasons focusable and prevents opening", async () => {
    await renderLifecycle({
      deletionReady: false,
      deletionUnavailableReason: "Configure cleanup providers.",
    });
    const button = findButton("Delete project");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toBe(
      "delete-project-reason",
    );

    await act(async () => button.click());
    expect(container.querySelector("#delete-project-confirmation")).toBeNull();
  });

  it("renders deletion-pending state as locked and retryable", async () => {
    await renderLifecycle({
      project: { ...baseProject, status: "deleting" },
      retainsManagedResources: true,
    });

    expect(findButton("Retry deletion")).toBeDefined();
    expect(
      container.querySelector<HTMLInputElement>("#project-name")?.disabled,
    ).toBe(true);
    expect(container.textContent).toContain(
      "External Neon, Upstash, or Vercel resources are not decommissioned.",
    );
  });
});
