import { describe, expect, it } from "vitest";
import { budgets } from "@/lib/config/budgets.server";
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

  it("preserves non-plain object values when redacting (defense against accidental deep traversal)", () => {
    class Box {
      constructor(readonly value: string) {}
    }

    const box = new Box("x");
    const input = { nested: box };

    const out = redactSecretsDeep(input);
    expect(out.nested).toBe(box);
  });

  it("serializes arrays and breaks cycles when building audit bundle files", () => {
    const repo: Record<string, unknown> = {
      cloneUrl: "https://example.com/repo.git",
      createdAt: "2026-02-09T00:00:00.000Z",
      defaultBranch: "main",
      htmlUrl: "https://example.com/repo",
      id: "repo_1",
      name: "repo",
      owner: "owner",
      provider: "github",
      updatedAt: "2026-02-09T00:00:00.000Z",
    };
    repo.self = repo;

    const data = {
      approvals: [],
      artifacts: [],
      deployments: [],
      project: { id: "proj_1", name: "Project", slug: "project" },
      repo: repo as unknown as {
        id: string;
        provider: string;
        owner: string;
        name: string;
        htmlUrl: string;
        cloneUrl: string;
        defaultBranch: string;
        createdAt: string;
        updatedAt: string;
      },
      run: {
        createdAt: "2026-02-09T00:00:00.000Z",
        id: "run_1",
        kind: "implementation",
        metadata: { list: [1, 2, 3] },
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
          inputs: { items: ["a", "b"] },
          outputs: { ok: true },
          startedAt: null,
          status: "succeeded",
          stepId: "impl.preflight",
          stepKind: "tool",
          stepName: "Preflight",
          updatedAt: "2026-02-09T00:00:00.000Z",
        },
      ],
    } as const;

    const files = buildImplementationAuditBundleFilesFromData(
      data as unknown as Parameters<
        typeof buildImplementationAuditBundleFilesFromData
      >[0],
    );

    const repoFile = files.find((f) => f.path === "repo.json");
    expect(repoFile).toBeTruthy();
    const repoJson = JSON.parse(
      new TextDecoder().decode(repoFile?.contentBytes),
    );
    expect(repoJson.self).toBe("[CYCLE]");
  });

  it("caps artifact content bytes to prevent massive audit bundles", () => {
    const bigText = "x".repeat(budgets.maxWebExtractCharsPerUrl * 10 + 50_000);

    const data = {
      approvals: [],
      artifacts: [
        {
          content: { bigText },
          createdAt: "2026-02-09T00:00:00.000Z",
          id: "art_1",
          kind: "artifact",
          logicalKey: "key",
          version: 1,
        },
      ],
      deployments: [],
      project: { id: "proj_1", name: "Project", slug: "project" },
      repo: null,
      run: {
        createdAt: "2026-02-09T00:00:00.000Z",
        id: "run_1",
        kind: "implementation",
        metadata: {},
        status: "succeeded",
        updatedAt: "2026-02-09T00:00:00.000Z",
        workflowRunId: "wf_1",
      },
      sandboxJobs: [],
      steps: [],
    } as const;

    const files = buildImplementationAuditBundleFilesFromData(
      data as unknown as Parameters<
        typeof buildImplementationAuditBundleFilesFromData
      >[0],
    );

    const artifactFile = files.find((f) => f.path.startsWith("artifacts/001."));
    expect(artifactFile).toBeTruthy();
    expect(artifactFile?.contentBytes.byteLength).toBeLessThanOrEqual(
      budgets.maxWebExtractCharsPerUrl * 10,
    );
  });
});
