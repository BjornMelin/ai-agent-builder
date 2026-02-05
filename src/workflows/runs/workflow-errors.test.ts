import { describe, expect, it } from "vitest";
import { WorkflowRunCancelledError } from "workflow/internal/errors";

import { isWorkflowRunCancelledError } from "./workflow-errors";

describe("isWorkflowRunCancelledError", () => {
  it("returns true for WorkflowRunCancelledError", () => {
    expect(
      isWorkflowRunCancelledError(new WorkflowRunCancelledError("run_1")),
    ).toBe(true);
  });

  it("returns false for non-workflow errors", () => {
    expect(isWorkflowRunCancelledError(new Error("nope"))).toBe(false);
  });

  it("returns false for non-object values", () => {
    expect(isWorkflowRunCancelledError(null)).toBe(false);
    expect(isWorkflowRunCancelledError(undefined)).toBe(false);
    expect(isWorkflowRunCancelledError("oops")).toBe(false);
  });
});
