import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claimChatWorkflow: vi.fn(),
  transitionChatThreadState: vi.fn(),
}));

vi.mock("@/lib/data/chat-start.server", () => ({
  claimChatWorkflow: state.claimChatWorkflow,
}));

vi.mock("@/lib/data/chat-thread-state.server", () => ({
  transitionChatThreadState: state.transitionChatThreadState,
}));

import {
  registerChatWorkflowStep,
  transitionChatThreadStateStep,
} from "./chat-thread-state.step";

describe("chat-thread-state steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.claimChatWorkflow.mockResolvedValue(true);
    state.transitionChatThreadState.mockResolvedValue({
      changed: true,
      id: "thread_1",
      status: "waiting",
      updatedAt: new Date("2026-07-13T00:00:00.000Z"),
    });
  });

  it("registers exactly one workflow owner for the route-persisted thread", async () => {
    await expect(registerChatWorkflowStep("thread_1", "run_1")).resolves.toBe(
      true,
    );

    expect(state.claimChatWorkflow).toHaveBeenCalledWith("thread_1", "run_1");
  });

  it("delegates lifecycle changes to the terminal-monotonic transition owner", async () => {
    const input = {
      endedAt: new Date("2026-07-13T00:01:00.000Z"),
      status: "succeeded" as const,
      workflowRunId: "run_1",
    };

    await transitionChatThreadStateStep(input);

    expect(state.transitionChatThreadState).toHaveBeenCalledWith(input);
  });
});
