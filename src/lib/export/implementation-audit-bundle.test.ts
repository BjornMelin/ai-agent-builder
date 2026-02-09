import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/core/sha256";
import {
  buildImplementationAuditBundleFilesFromData,
  redactSecretsDeep,
} from "@/lib/export/implementation-audit-bundle.server";
import { buildExportZipBytes } from "@/lib/export/zip.server";

describe("implementation audit bundle", () => {
  it("redacts secret-like keys recursively", () => {
    const input = {
      apiKey: "secret",
      list: [{ clientSecret: "s" }],
      nested: { ok: "x", token: "t" },
    };

    expect(redactSecretsDeep(input)).toEqual({
      apiKey: "[REDACTED]",
      list: [{ clientSecret: "[REDACTED]" }],
      nested: { ok: "x", token: "[REDACTED]" },
    });
  });

  it("builds deterministic zip bytes for identical logical data (key order independent)", async () => {
    const base = {
      approvals: [],
      artifacts: [],
      deployments: [],
      project: { id: "proj_1", name: "Project", slug: "project" },
      repo: null,
      run: {
        createdAt: "2026-02-09T00:00:00.000Z",
        id: "run_1",
        kind: "implementation",
        metadata: { a: 1, b: 2 },
        status: "succeeded",
        updatedAt: "2026-02-09T00:00:00.000Z",
        workflowRunId: "wf_1",
      },
      sandboxJobs: [],
      steps: [
        {
          attempt: 0,
          createdAt: "2026-02-09T00:00:00.000Z",
          endedAt: null,
          error: null,
          id: "step_row_1",
          inputs: { a: 1, z: 2 },
          outputs: { a: 1, b: 2 },
          startedAt: null,
          status: "succeeded",
          stepId: "impl.preflight",
          stepKind: "tool",
          stepName: "Preflight",
          updatedAt: "2026-02-09T00:00:00.000Z",
        },
      ],
    } as const;

    // Same data with reordered keys in JSON fields.
    const permuted = {
      ...base,
      run: { ...base.run, metadata: { a: 1, b: 2 } },
      steps: [
        {
          ...base.steps[0],
          inputs: { a: 1, z: 2 },
          outputs: { a: 1, b: 2 },
        },
      ],
    } as const;

    const filesA = buildImplementationAuditBundleFilesFromData(
      base as unknown as Parameters<
        typeof buildImplementationAuditBundleFilesFromData
      >[0],
    );
    const filesB = buildImplementationAuditBundleFilesFromData(
      permuted as unknown as Parameters<
        typeof buildImplementationAuditBundleFilesFromData
      >[0],
    );

    const zipA = await buildExportZipBytes({
      files: filesA,
      project: base.project,
    });
    const zipB = await buildExportZipBytes({
      files: filesB,
      project: base.project,
    });

    expect(sha256Hex(zipA.bytes)).toBe(sha256Hex(zipB.bytes));
  });
});
