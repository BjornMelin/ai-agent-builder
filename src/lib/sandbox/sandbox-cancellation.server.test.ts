import { APIError, type Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";

import type { SandboxJobDto } from "@/lib/data/sandbox-jobs.server";
import {
  cancelProvisionedSandboxJob,
  cancelRunSandboxes,
  stopRunOwnedSandbox,
} from "@/lib/sandbox/sandbox-cancellation.server";

function createJob(
  id: string,
  sandboxId: string | null,
  status = "canceling",
  sandboxStoppedAt: string | null = null,
): SandboxJobDto {
  return {
    createdAt: new Date(0).toISOString(),
    endedAt: null,
    exitCode: null,
    id,
    jobType: "code_mode",
    metadata: {},
    projectId: "project_1",
    provisioningClaimedAt: sandboxId ? null : new Date(0).toISOString(),
    provisioningExpiresAt: sandboxId ? null : new Date(60_000).toISOString(),
    provisioningKey: "workflow-step-1",
    runId: "run_1",
    sandboxId,
    sandboxStopClaimedAt: null,
    sandboxStoppedAt,
    startedAt: null,
    status,
    stepId: null,
    transcriptBlobRef: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function createSandbox(
  sandboxId: string,
  options: Readonly<{
    status?: string;
    stop?: ReturnType<typeof vi.fn>;
  }> = {},
): Sandbox & Readonly<{ stop: ReturnType<typeof vi.fn> }> {
  const stop =
    options.stop ??
    vi.fn(async () => ({ sandboxId, status: "stopped" }) as never);
  return {
    sandboxId,
    status: options.status ?? "running",
    stop,
  } as unknown as Sandbox & Readonly<{ stop: ReturnType<typeof vi.fn> }>;
}

function claimed() {
  return { claimedAt: new Date(0), state: "claimed" as const };
}

describe("cancelRunSandboxes", () => {
  it("stops each unique resource once and persists shared-job confirmation", async () => {
    const sandbox = createSandbox("sandbox_1");
    const jobs = [
      createJob("job_1", "sandbox_1"),
      createJob("job_2", "sandbox_1", "succeeded"),
    ];
    const confirmStopped = vi.fn(async () => {});

    await cancelRunSandboxes("run_1", {
      claimJobs: vi.fn(async () => jobs),
      claimStop: vi.fn(async () => claimed()),
      confirmStopped,
      getSandbox: vi.fn(async () => sandbox),
      now: () => new Date(0),
    });

    expect(sandbox.stop).toHaveBeenCalledOnce();
    expect(confirmStopped).toHaveBeenCalledOnce();
    expect(confirmStopped).toHaveBeenCalledWith(
      "run_1",
      "sandbox_1",
      new Date(0),
    );
  });

  it("persists successful IDs while surfacing another stop failure", async () => {
    const success = createSandbox("sandbox_ok");
    const failed = createSandbox("sandbox_failed", {
      stop: vi.fn(async () => {
        throw new Error("stop failed");
      }),
    });
    const jobs = [
      createJob("job_ok", "sandbox_ok"),
      createJob("job_failed", "sandbox_failed"),
    ];
    const confirmStopped = vi.fn(async () => {});

    await expect(
      cancelRunSandboxes("run_1", {
        claimJobs: vi.fn(async () => jobs),
        claimStop: vi.fn(async () => claimed()),
        confirmStopped,
        getSandbox: vi.fn(async (sandboxId: string) =>
          sandboxId === "sandbox_ok" ? success : failed,
        ),
        releaseStop: vi.fn(async () => {}),
      }),
    ).rejects.toMatchObject({ code: "sandbox_cancel_failed", status: 502 });

    expect(confirmStopped).toHaveBeenCalledWith(
      "run_1",
      "sandbox_ok",
      expect.any(Date),
    );
    expect(confirmStopped).not.toHaveBeenCalledWith(
      "run_1",
      "sandbox_failed",
      expect.any(Date),
    );
  });

  it("keeps a live no-ID provisioning window retryable", async () => {
    const getSandbox = vi.fn();

    await expect(
      cancelRunSandboxes("run_1", {
        claimJobs: vi.fn(async () => [createJob("job_1", null)]),
        getSandbox,
      }),
    ).rejects.toMatchObject({ code: "sandbox_cancel_pending", status: 409 });
    expect(getSandbox).not.toHaveBeenCalled();
  });

  it("completes after the DAL expires an unknown provisioning window", async () => {
    const canceling = createJob("job_1", null);
    const canceled = createJob("job_1", null, "canceled");

    await expect(
      cancelRunSandboxes("run_1", {
        claimJobs: vi
          .fn()
          .mockResolvedValueOnce([canceling])
          .mockResolvedValueOnce([canceled]),
      }),
    ).resolves.toBeUndefined();
  });

  it("treats a missing provider sandbox as confirmed stopped", async () => {
    const missing = new APIError(new Response(null, { status: 404 }));
    const confirmStopped = vi.fn(async () => {});

    await cancelRunSandboxes("run_1", {
      claimJobs: vi.fn(async () => [createJob("job_1", "missing")]),
      claimStop: vi.fn(async () => claimed()),
      confirmStopped,
      getSandbox: vi.fn(async () => {
        throw missing;
      }),
    });

    expect(confirmStopped).toHaveBeenCalledWith(
      "run_1",
      "missing",
      expect.any(Date),
    );
  });

  it("reports concurrent stop ownership as retryable without duplicate I/O", async () => {
    const getSandbox = vi.fn();

    await expect(
      cancelRunSandboxes("run_1", {
        claimJobs: vi.fn(async () => [createJob("job_1", "sandbox_1")]),
        claimStop: vi.fn(async () => ({ state: "busy" as const })),
        getSandbox,
      }),
    ).rejects.toMatchObject({ code: "sandbox_cancel_pending", status: 409 });
    expect(getSandbox).not.toHaveBeenCalled();
  });
});

describe("stopRunOwnedSandbox", () => {
  it("uses one signal for lookup, stop, and durable confirmation", async () => {
    const sandbox = createSandbox("sandbox_1");
    let lookupSignal: AbortSignal | undefined;
    const confirmStopped = vi.fn(async () => {});

    await stopRunOwnedSandbox(
      { runId: "run_1", sandboxId: "sandbox_1" },
      {
        claimStop: vi.fn(async () => claimed()),
        confirmStopped,
        getSandbox: vi.fn(async (_id, options) => {
          lookupSignal = options.signal;
          return sandbox;
        }),
      },
    );

    expect(lookupSignal).toBeInstanceOf(AbortSignal);
    expect(sandbox.stop.mock.calls[0]?.[0]?.signal).toBe(lookupSignal);
    expect(confirmStopped).toHaveBeenCalledOnce();
  });

  it("bounds a hanging lookup and releases the exact durable lease", async () => {
    const controller = new AbortController();
    const releaseStop = vi.fn(async () => {});
    const operation = stopRunOwnedSandbox(
      { runId: "run_1", sandboxId: "sandbox_1" },
      {
        claimStop: vi.fn(async () => claimed()),
        createDeadline: () => controller.signal,
        getSandbox: vi.fn(async () => await new Promise<Sandbox>(() => {})),
        releaseStop,
        stopTimeoutMs: 123,
      },
    );

    await Promise.resolve();
    controller.abort();
    await expect(operation).rejects.toMatchObject({
      code: "sandbox_stop_timeout",
      status: 504,
    });
    expect(releaseStop).toHaveBeenCalledWith("run_1", "sandbox_1", new Date(0));
  });

  it("rejects when sandbox_stopped_at persistence misses the deadline", async () => {
    const controller = new AbortController();
    const releaseStop = vi.fn(async () => {});
    const operation = stopRunOwnedSandbox(
      {
        runId: "run_1",
        sandbox: createSandbox("sandbox_1"),
        sandboxId: "sandbox_1",
      },
      {
        claimStop: vi.fn(async () => claimed()),
        confirmStopped: vi.fn(async () => await new Promise<void>(() => {})),
        createDeadline: () => controller.signal,
        releaseStop,
        stopTimeoutMs: 123,
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(operation).rejects.toMatchObject({
      code: "sandbox_stop_timeout",
      status: 504,
    });
    expect(releaseStop).toHaveBeenCalledOnce();
  });
});

describe("cancelProvisionedSandboxJob", () => {
  it("publishes ownership before leased stop and durable completion", async () => {
    const sandbox = createSandbox("sandbox_1");
    const events: string[] = [];

    await cancelProvisionedSandboxJob(
      { jobId: "job_1", runId: "run_1", sandbox },
      {
        claimStop: vi.fn(async () => claimed()),
        completeJobs: vi.fn(async () => {
          events.push("complete");
        }),
        confirmStopped: vi.fn(async () => {
          events.push("confirm");
        }),
        publishOwnership: vi.fn(async () => {
          events.push("publish");
          return createJob("job_1", "sandbox_1");
        }),
      },
    );

    expect(events).toEqual(["publish", "confirm", "complete"]);
    expect(sandbox.stop).toHaveBeenCalledWith({
      blocking: true,
      signal: expect.any(AbortSignal),
    });
  });

  it("directly stops the known object when ownership publication fails", async () => {
    const sandbox = createSandbox("sandbox_1");
    const recordStopped = vi.fn(async () =>
      createJob("job_1", "sandbox_1", "failed", new Date(0).toISOString()),
    );

    await cancelProvisionedSandboxJob(
      { jobId: "job_1", runId: "run_1", sandbox },
      {
        completeJobs: vi.fn(async () => {}),
        publishOwnership: vi.fn(async () => {
          throw new Error("activation database write failed");
        }),
        recordStopped,
      },
    );

    expect(sandbox.stop).toHaveBeenCalledOnce();
    expect(recordStopped).toHaveBeenCalledWith(
      "job_1",
      "sandbox_1",
      expect.any(Date),
    );
  });

  it("surfaces direct known-object cleanup failure without recording terminal state", async () => {
    const sandbox = createSandbox("sandbox_1", {
      stop: vi.fn(async () => {
        throw new Error("provider stop failed");
      }),
    });
    const recordStopped = vi.fn();

    await expect(
      cancelProvisionedSandboxJob(
        { jobId: "job_1", runId: "run_1", sandbox },
        {
          getSandbox: vi.fn(async () => sandbox),
          publishOwnership: vi.fn(async () => {
            throw new Error("publication failed");
          }),
          recordStopped,
        },
      ),
    ).rejects.toMatchObject({ code: "sandbox_cleanup_failed", status: 502 });
    expect(recordStopped).not.toHaveBeenCalled();
  });
});
