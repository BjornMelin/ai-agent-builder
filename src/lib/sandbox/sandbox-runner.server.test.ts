import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";
import { RetryableError } from "workflow";

import { AppError } from "@/lib/core/errors";
import type { SandboxJobDto } from "@/lib/data/sandbox-jobs.server";
import {
  attachSandboxJobSession,
  startSandboxJobSession,
} from "@/lib/sandbox/sandbox-runner.server";

function createJob(
  status = "pending",
  overrides: Partial<SandboxJobDto> = {},
): SandboxJobDto {
  return {
    createdAt: new Date(0).toISOString(),
    endedAt: null,
    exitCode: null,
    id: "job_test",
    jobType: "code_mode",
    metadata: {},
    projectId: "proj_test",
    provisioningClaimedAt: new Date(0).toISOString(),
    provisioningExpiresAt: new Date(61_000).toISOString(),
    provisioningKey: "workflow-step-1",
    runId: "run_test",
    sandboxId: null,
    sandboxStopClaimedAt: null,
    sandboxStoppedAt: null,
    startedAt: null,
    status,
    stepId: null,
    transcriptBlobRef: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createFakeSandbox(
  sandboxId = "sb_test",
): Sandbox & Readonly<{ stop: ReturnType<typeof vi.fn> }> {
  const stop = vi.fn(async () => ({ sandboxId, status: "stopped" }) as never);
  const sandbox = {
    async runCommand(_params: unknown) {
      const logs = async function* () {
        yield { data: "hello from stdout\n", stream: "stdout" as const };
        yield { data: "hello from stderr\n", stream: "stderr" as const };
      };
      const handle = logs() as AsyncGenerator<
        | { data: string; stream: "stdout" }
        | {
            data: string;
            stream: "stderr";
          },
        void,
        void
      > & { close: () => void };
      handle.close = () => {};
      return {
        logs: () => handle,
        wait: async () => ({ exitCode: 0 }),
      } as unknown;
    },
    sandboxId,
    status: "running",
    stop,
  } as unknown as Sandbox;
  return Object.assign(sandbox, { stop });
}

function createUpdateJob(events?: string[]) {
  return vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    events?.push(`update:${String(patch.status)}`);
    return createJob(
      typeof patch.status === "string" ? patch.status : "running",
      {
        endedAt:
          patch.endedAt instanceof Date ? patch.endedAt.toISOString() : null,
        exitCode: typeof patch.exitCode === "number" ? patch.exitCode : null,
        provisioningClaimedAt: null,
        provisioningExpiresAt: null,
        sandboxId: "sb_test",
        startedAt: new Date(0).toISOString(),
        transcriptBlobRef:
          typeof patch.transcriptBlobRef === "string"
            ? patch.transcriptBlobRef
            : null,
      },
    );
  });
}

function startInput() {
  return {
    jobType: "code_mode",
    networkPolicy: "deny-all" as const,
    projectId: "proj_test",
    provisioningKey: "workflow-step-1",
    runId: "run_test",
    timeoutMs: 60_000,
  };
}

function runningActivation() {
  return vi.fn(async () =>
    createJob("running", {
      provisioningClaimedAt: null,
      provisioningExpiresAt: null,
      sandboxId: "sb_test",
      startedAt: new Date(0).toISOString(),
    }),
  );
}

describe("startSandboxJobSession", () => {
  it("claims the stable provisioning key and bounds native creation", async () => {
    const sandbox = createFakeSandbox();
    const claimProvisioning = vi.fn(async () => ({
      job: createJob(),
      state: "provision" as const,
    }));
    const createSandbox = vi.fn(async () => sandbox);

    await startSandboxJobSession(startInput(), {
      activateJob: runningActivation(),
      claimProvisioning,
      createSandbox,
    });

    expect(claimProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({
        createTimeoutMs: 20_000,
        provisioningKey: "workflow-step-1",
        timeoutMs: 60_000,
      }),
    );
    expect(createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not provision while a prior unknown-resource window is live", async () => {
    const createSandbox = vi.fn();
    const provisioningExpiresAt = new Date(61_000).toISOString();

    const error = await startSandboxJobSession(startInput(), {
      claimProvisioning: vi.fn(async () => ({
        job: createJob("pending", { provisioningExpiresAt }),
        state: "pending" as const,
      })),
      createSandbox,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RetryableError);
    expect(error).toMatchObject({
      retryAfter: new Date(provisioningExpiresAt),
    });
    expect(createSandbox).not.toHaveBeenCalled();
  });

  it("rejects an invalid pending claim without a durable expiry", async () => {
    await expect(
      startSandboxJobSession(startInput(), {
        claimProvisioning: vi.fn(async () => ({
          job: createJob("pending", { provisioningExpiresAt: null }),
          state: "pending" as const,
        })),
      }),
    ).rejects.toMatchObject({
      code: "sandbox_provisioning_window_missing",
      status: 500,
    });
  });

  it("reuses the published sandbox across Workflow retries", async () => {
    const sandbox = createFakeSandbox();
    const getSandbox = vi.fn(async () => sandbox);
    const createSandbox = vi.fn();
    const session = await startSandboxJobSession(startInput(), {
      claimProvisioning: vi.fn(async () => ({
        job: createJob("running", {
          provisioningClaimedAt: null,
          provisioningExpiresAt: null,
          sandboxId: "sb_test",
        }),
        state: "reuse" as const,
      })),
      createSandbox,
      getSandbox,
    });

    expect(session.job.id).toBe("job_test");
    expect(createSandbox).not.toHaveBeenCalled();
    expect(getSandbox).toHaveBeenCalledWith("sb_test", {
      signal: expect.any(AbortSignal),
    });
  });

  it("leaves the durable job nonterminal when creation has an unknown outcome", async () => {
    const updateJob = createUpdateJob();
    const cancelProvisionedJob = vi.fn();
    const provisionError = new Error("provider response lost");

    await expect(
      startSandboxJobSession(startInput(), {
        cancelProvisionedJob,
        claimProvisioning: vi.fn(async () => ({
          job: createJob(),
          state: "provision" as const,
        })),
        createSandbox: vi.fn(async () => {
          throw provisionError;
        }),
        updateJob,
      }),
    ).rejects.toBe(provisionError);
    expect(cancelProvisionedJob).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("cleans up a known sandbox before recording activation failure", async () => {
    const sandbox = createFakeSandbox();
    const events: string[] = [];
    const activationError = new Error("activation write failed");
    const updateJob = createUpdateJob(events);

    await expect(
      startSandboxJobSession(startInput(), {
        activateJob: vi.fn(async () => {
          throw activationError;
        }),
        cancelProvisionedJob: vi.fn(async () => {
          events.push("cleanup");
        }),
        claimProvisioning: vi.fn(async () => ({
          job: createJob(),
          state: "provision" as const,
        })),
        createSandbox: vi.fn(async () => sandbox),
        updateJob,
      }),
    ).rejects.toBe(activationError);
    expect(events).toEqual(["cleanup", "update:failed"]);
  });

  it("never terminalizes a known resource when activation cleanup fails", async () => {
    const cleanupError = new Error("cleanup unconfirmed");
    const updateJob = createUpdateJob();

    await expect(
      startSandboxJobSession(startInput(), {
        activateJob: vi.fn(async () => {
          throw new Error("activation failed");
        }),
        cancelProvisionedJob: vi.fn(async () => {
          throw cleanupError;
        }),
        claimProvisioning: vi.fn(async () => ({
          job: createJob(),
          state: "provision" as const,
        })),
        createSandbox: vi.fn(async () => createFakeSandbox()),
        updateJob,
      }),
    ).rejects.toMatchObject({
      code: "sandbox_activation_cleanup_failed",
      status: 502,
    });
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("enforces the allowlist before running commands", async () => {
    const session = await startSandboxJobSession(startInput(), {
      activateJob: runningActivation(),
      claimProvisioning: vi.fn(async () => ({
        job: createJob(),
        state: "provision" as const,
      })),
      createSandbox: vi.fn(async () => createFakeSandbox()),
    });

    await expect(
      session.runCommand({ cmd: "curl", policy: "code_mode" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("requires durable stop confirmation before persisting success", async () => {
    const events: string[] = [];
    const stopOwnedSandbox = vi.fn(async () => {
      events.push("stop-confirmed");
    });
    const updateJob = createUpdateJob(events);
    const session = await startSandboxJobSession(startInput(), {
      activateJob: runningActivation(),
      claimProvisioning: vi.fn(async () => ({
        job: createJob(),
        state: "provision" as const,
      })),
      createSandbox: vi.fn(async () => createFakeSandbox()),
      stopOwnedSandbox,
      updateJob,
    });

    await session.finalize({ exitCode: 0, status: "succeeded" });
    await session.finalize({ exitCode: 0, status: "succeeded" });
    expect(events).toEqual(["stop-confirmed", "update:succeeded"]);
    expect(stopOwnedSandbox).toHaveBeenCalledOnce();
  });

  it("does not persist success when stop confirmation fails", async () => {
    const stopError = new Error("stop confirmation failed");
    const updateJob = createUpdateJob();
    const session = await startSandboxJobSession(startInput(), {
      activateJob: runningActivation(),
      claimProvisioning: vi.fn(async () => ({
        job: createJob(),
        state: "provision" as const,
      })),
      createSandbox: vi.fn(async () => createFakeSandbox()),
      stopOwnedSandbox: vi.fn(async () => {
        throw stopError;
      }),
      updateJob,
    });

    await expect(
      session.finalize({ exitCode: 0, status: "succeeded" }),
    ).rejects.toBe(stopError);
    expect(updateJob).not.toHaveBeenCalled();
  });

  it("surfaces final job update failure after one confirmed stop", async () => {
    const persistenceError = new Error("job update failed");
    const stopOwnedSandbox = vi.fn(async () => {});
    const session = await startSandboxJobSession(startInput(), {
      activateJob: runningActivation(),
      claimProvisioning: vi.fn(async () => ({
        job: createJob(),
        state: "provision" as const,
      })),
      createSandbox: vi.fn(async () => createFakeSandbox()),
      stopOwnedSandbox,
      updateJob: vi.fn(async () => {
        throw persistenceError;
      }),
    });

    await expect(
      session.finalize({ exitCode: 0, status: "succeeded" }),
    ).rejects.toBe(persistenceError);
    await expect(
      session.finalize({ exitCode: 0, status: "succeeded" }),
    ).rejects.toBe(persistenceError);
    expect(stopOwnedSandbox).toHaveBeenCalledOnce();
  });
});

describe("attachSandboxJobSession", () => {
  it("captures transcripts without stopping a shared sandbox by default", async () => {
    const sandbox = createFakeSandbox();
    const stopOwnedSandbox = vi.fn();
    const session = await attachSandboxJobSession(
      {
        jobType: "implementation_verify",
        projectId: "proj_test",
        runId: "run_test",
        sandboxId: "sb_test",
      },
      {
        activateJob: runningActivation(),
        createJob: vi.fn(async () => createJob()),
        getSandbox: vi.fn(async () => sandbox),
        stopOwnedSandbox,
        updateJob: createUpdateJob(),
      },
    );

    await session.runCommand({ cmd: "ls", policy: "code_mode" });
    const result = await session.finalize({ exitCode: 0, status: "succeeded" });
    expect(result.transcript.combined).toContain("hello from stdout");
    expect(stopOwnedSandbox).not.toHaveBeenCalled();
  });

  it("uses the same durable stop owner when configured", async () => {
    const sandbox = createFakeSandbox();
    const stopOwnedSandbox = vi.fn(async () => {});
    const session = await attachSandboxJobSession(
      {
        jobType: "implementation_verify",
        projectId: "proj_test",
        runId: "run_test",
        sandboxId: "sb_test",
        stopOnFinalize: true,
      },
      {
        activateJob: runningActivation(),
        createJob: vi.fn(async () => createJob()),
        getSandbox: vi.fn(async () => sandbox),
        stopOwnedSandbox,
        updateJob: createUpdateJob(),
      },
    );

    await session.finalize({ exitCode: 0, status: "succeeded" });
    expect(stopOwnedSandbox).toHaveBeenCalledWith({
      runId: "run_test",
      sandbox,
      sandboxId: "sb_test",
    });
  });

  it("exposes the same durable stop owner for explicit cleanup", async () => {
    const sandbox = createFakeSandbox();
    const stopOwnedSandbox = vi.fn(async () => {});
    const session = await attachSandboxJobSession(
      {
        jobType: "implementation_patch",
        projectId: "proj_test",
        runId: "run_test",
        sandboxId: "sb_test",
      },
      {
        activateJob: runningActivation(),
        createJob: vi.fn(async () => createJob()),
        getSandbox: vi.fn(async () => sandbox),
        stopOwnedSandbox,
        updateJob: createUpdateJob(),
      },
    );

    await session.stop();
    expect(stopOwnedSandbox).toHaveBeenCalledWith({
      runId: "run_test",
      sandbox,
      sandboxId: "sb_test",
    });
  });
});
