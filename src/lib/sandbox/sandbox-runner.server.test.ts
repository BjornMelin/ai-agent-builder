import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/core/errors";
import { startSandboxJobSession } from "@/lib/sandbox/sandbox-runner.server";

function createFakeSandbox(): Sandbox {
  const sandboxId = "sb_test";
  const sandbox = {
    async runCommand(_params: unknown) {
      const logs = async function* () {
        yield { data: "hello from stdout\n", stream: "stdout" as const };
        yield { data: "hello from stderr\n", stream: "stderr" as const };
      };

      const handle = logs() as AsyncGenerator<
        { data: string; stream: "stdout" } | { data: string; stream: "stderr" },
        void,
        void
      > & { close: () => void };
      handle.close = () => {};

      return {
        logs() {
          return handle;
        },
        async wait() {
          return { exitCode: 0 };
        },
      } as unknown;
    },
    sandboxId,
    async stop() {},
  } as unknown as Sandbox;

  return sandbox;
}

describe("startSandboxJobSession", () => {
  it("enforces the allowlist before running commands", async () => {
    const sandbox = createFakeSandbox();

    const session = await startSandboxJobSession(
      {
        jobType: "code_mode",
        networkPolicy: { type: "no-access" },
        projectId: "proj_test",
        runId: "run_test",
        timeoutMs: 60_000,
      },
      {
        createJob: async () =>
          ({
            createdAt: new Date().toISOString(),
            endedAt: null,
            exitCode: null,
            id: "job_test",
            jobType: "code_mode",
            metadata: {},
            projectId: "proj_test",
            runId: "run_test",
            startedAt: null,
            status: "pending",
            stepId: null,
            transcriptBlobRef: null,
            updatedAt: new Date().toISOString(),
          }) as const,
        createSandbox: async () => sandbox,
        updateJob: async (_id, patch) =>
          ({
            createdAt: new Date().toISOString(),
            endedAt: patch.endedAt ? patch.endedAt.toISOString() : null,
            exitCode: patch.exitCode ?? null,
            id: "job_test",
            jobType: "code_mode",
            metadata: patch.metadata ?? {},
            projectId: "proj_test",
            runId: "run_test",
            startedAt: patch.startedAt ? patch.startedAt.toISOString() : null,
            status: patch.status ?? "running",
            stepId: null,
            transcriptBlobRef: patch.transcriptBlobRef ?? null,
            updatedAt: new Date().toISOString(),
          }) as const,
      },
    );

    await expect(
      session.runCommand({ cmd: "curl", policy: "code_mode" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("captures transcript output and persists a blob ref on finalize", async () => {
    const sandbox = createFakeSandbox();

    const putTranscriptBlob = vi.fn(async () => "https://blob.example/log");
    const updateJob = vi.fn(
      async (
        _id: string,
        patch: Readonly<{
          status?: string;
          metadata?: Record<string, unknown>;
          startedAt?: Date | null;
          endedAt?: Date | null;
          exitCode?: number | null;
          transcriptBlobRef?: string | null;
        }>,
      ) =>
        ({
          createdAt: new Date().toISOString(),
          endedAt: patch.endedAt ? patch.endedAt.toISOString() : null,
          exitCode: patch.exitCode ?? null,
          id: "job_test",
          jobType: "code_mode",
          metadata: patch.metadata ?? {},
          projectId: "proj_test",
          runId: "run_test",
          startedAt: patch.startedAt ? patch.startedAt.toISOString() : null,
          status: patch.status ?? "running",
          stepId: null,
          transcriptBlobRef: patch.transcriptBlobRef ?? null,
          updatedAt: new Date().toISOString(),
        }) as const,
    );

    const session = await startSandboxJobSession(
      {
        jobType: "code_mode",
        networkPolicy: { type: "no-access" },
        projectId: "proj_test",
        runId: "run_test",
        timeoutMs: 60_000,
      },
      {
        createJob: async () =>
          ({
            createdAt: new Date().toISOString(),
            endedAt: null,
            exitCode: null,
            id: "job_test",
            jobType: "code_mode",
            metadata: {},
            projectId: "proj_test",
            runId: "run_test",
            startedAt: null,
            status: "pending",
            stepId: null,
            transcriptBlobRef: null,
            updatedAt: new Date().toISOString(),
          }) as const,
        createSandbox: async () => sandbox,
        putTranscriptBlob,
        updateJob,
      },
    );

    const command = await session.runCommand({
      cmd: "ls",
      policy: "code_mode",
    });
    expect(command.exitCode).toBe(0);

    const result = await session.finalize({ exitCode: 0, status: "succeeded" });

    expect(result.transcript.combined).toContain("hello from stdout");
    expect(result.transcript.combined).toContain("hello from stderr");
    expect(putTranscriptBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        blobPath: "projects/proj_test/runs/run_test/sandbox/job_test.log",
      }),
    );
    expect(updateJob).toHaveBeenCalledWith(
      "job_test",
      expect.objectContaining({
        transcriptBlobRef: "https://blob.example/log",
      }),
    );
  });
});
