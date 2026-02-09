import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { budgets } from "@/lib/config/budgets.server";
import { AppError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/core/sha256";
import {
  getImplementationAuditBundleBlobPath,
  putImplementationAuditBundleBlob,
} from "@/lib/export/implementation-audit-bundle-blob.server";
import {
  buildExportZipBytes,
  type ExportManifest,
} from "@/lib/export/zip.server";

type JsonPrimitive = null | boolean | number | string;

// Recursive JSON type: use interfaces for the recursive arms to avoid TS2456
// ("type alias circularly references itself") under strict compiler settings.
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
interface JsonObject {
  [key: string]: JsonValue;
}
interface JsonArray extends Array<JsonValue> {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { constructor?: unknown }).constructor === Object
  );
}

function stableStringify(value: JsonValue): string {
  const seen = new WeakSet<object>();

  const visit = (v: JsonValue): JsonValue => {
    if (v === null) return null;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => visit(x as JsonValue));

    // Object
    const obj = v as Record<string, JsonValue>;
    if (seen.has(obj as unknown as object)) {
      return "[CYCLE]" as unknown as JsonValue;
    }
    seen.add(obj as unknown as object);

    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
      out[key] = visit(obj[key] as JsonValue);
    }
    return out;
  };

  return JSON.stringify(visit(value), null, 2);
}

const SECRET_KEY_RE =
  /(token|secret|password|authorization|cookie|private[_-]?key|api[_-]?key|client[_-]?secret|access[_-]?key)/i;

/**
 * Redact secret-like keys from arbitrary JSON data.
 *
 * @remarks
 * This is key-based redaction only. It intentionally does not attempt to detect
 * secret values heuristically (to avoid false positives and nondeterminism).
 *
 * @param value - Arbitrary value to redact in a best-effort, key-based manner.
 * @returns The input value with secret-like keys replaced with `"[REDACTED]"`.
 */
export function redactSecretsDeep<T>(value: T): T {
  const visit = (v: unknown): unknown => {
    if (v === null) return null;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      return v;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (!isPlainObject(v)) return v;

    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = visit(val);
      }
    }
    return out;
  };

  return visit(value) as T;
}

function jsonBytes(value: JsonValue): Uint8Array {
  const text = `${stableStringify(value)}\n`;
  return new TextEncoder().encode(text);
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

export type ImplementationAuditBundleData = Readonly<{
  project: Readonly<{ id: string; slug: string; name: string }>;
  run: Readonly<{
    id: string;
    kind: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    workflowRunId: string | null;
    metadata: Record<string, unknown>;
  }>;
  repo: Readonly<{
    id: string;
    provider: string;
    owner: string;
    name: string;
    htmlUrl: string;
    cloneUrl: string;
    defaultBranch: string;
    createdAt: string;
    updatedAt: string;
  }> | null;
  steps: readonly Readonly<{
    id: string;
    stepId: string;
    stepKind: string;
    stepName: string;
    status: string;
    attempt: number;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
    error: Record<string, unknown> | null;
  }>[];
  sandboxJobs: readonly Readonly<{
    id: string;
    jobType: string;
    status: string;
    exitCode: number | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    transcriptBlobRef: string | null;
    metadata: Record<string, unknown>;
  }>[];
  approvals: readonly Readonly<{
    id: string;
    scope: string;
    intentSummary: string;
    createdAt: string;
    approvedAt: string | null;
    approvedBy: string | null;
    metadata: Record<string, unknown>;
  }>[];
  deployments: readonly Readonly<{
    id: string;
    provider: string;
    status: string;
    deploymentUrl: string | null;
    vercelDeploymentId: string | null;
    vercelProjectId: string | null;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    endedAt: string | null;
    metadata: Record<string, unknown>;
  }>[];
  artifacts: readonly Readonly<{
    id: string;
    kind: string;
    logicalKey: string;
    version: number;
    createdAt: string;
    content: Record<string, unknown>;
  }>[];
}>;

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function safeJsonRecord(input: Record<string, unknown>): JsonValue {
  // Convert unknown record into JSON-serializable data where possible.
  // `jsonb` fields should already be plain JSON, but we still defensively coerce.
  return redactSecretsDeep(input) as unknown as JsonValue;
}

/**
 * Build deterministic audit bundle files from pre-collected data.
 *
 * @param data - Collected data used to produce deterministic audit bundle files.
 * @returns Deterministic file entries to be zipped and uploaded.
 */
export function buildImplementationAuditBundleFilesFromData(
  data: ImplementationAuditBundleData,
): readonly Readonly<{ path: string; contentBytes: Uint8Array }>[] {
  const files: Array<Readonly<{ path: string; contentBytes: Uint8Array }>> = [];

  const bundleMeta: JsonValue = {
    generatedAt: new Date(0).toISOString(),
    kind: "implementation_audit_bundle",
    projectId: data.project.id,
    runId: data.run.id,
    version: 1,
  };

  files.push({ contentBytes: jsonBytes(bundleMeta), path: "bundle.json" });
  files.push({
    contentBytes: jsonBytes({
      ...data.run,
      metadata: safeJsonRecord(data.run.metadata),
    } satisfies JsonValue),
    path: "run.json",
  });

  if (data.repo) {
    files.push({
      contentBytes: jsonBytes(data.repo satisfies JsonValue),
      path: "repo.json",
    });
  }

  const stepsSorted = [...data.steps].sort((a, b) =>
    a.stepId.localeCompare(b.stepId),
  );
  for (const [idx, step] of stepsSorted.entries()) {
    files.push({
      contentBytes: jsonBytes({
        ...step,
        error: step.error ? (safeJsonRecord(step.error) as JsonValue) : null,
        inputs: safeJsonRecord(step.inputs) as JsonValue,
        outputs: safeJsonRecord(step.outputs) as JsonValue,
      } satisfies JsonValue),
      path: `steps/${pad3(idx + 1)}.${step.stepId}.json`,
    });
  }

  const jobsSorted = [...data.sandboxJobs].sort((a, b) => {
    const byType = a.jobType.localeCompare(b.jobType);
    return byType !== 0 ? byType : a.id.localeCompare(b.id);
  });
  for (const [idx, job] of jobsSorted.entries()) {
    files.push({
      contentBytes: jsonBytes({
        ...job,
        metadata: safeJsonRecord(job.metadata),
      } satisfies JsonValue),
      path: `sandbox_jobs/${pad3(idx + 1)}.${job.jobType}.${job.id}.json`,
    });
  }

  const approvalsSorted = [...data.approvals].sort((a, b) => {
    const byScope = a.scope.localeCompare(b.scope);
    return byScope !== 0 ? byScope : a.id.localeCompare(b.id);
  });
  for (const [idx, approval] of approvalsSorted.entries()) {
    files.push({
      contentBytes: jsonBytes({
        ...approval,
        metadata: safeJsonRecord(approval.metadata),
      } satisfies JsonValue),
      path: `approvals/${pad3(idx + 1)}.${approval.scope}.${approval.id}.json`,
    });
  }

  const deploymentsSorted = [...data.deployments].sort((a, b) => {
    const byStatus = a.status.localeCompare(b.status);
    return byStatus !== 0 ? byStatus : a.id.localeCompare(b.id);
  });
  for (const [idx, dep] of deploymentsSorted.entries()) {
    files.push({
      contentBytes: jsonBytes({
        ...dep,
        metadata: safeJsonRecord(dep.metadata),
      } satisfies JsonValue),
      path: `deployments/${pad3(idx + 1)}.${dep.provider}.${dep.id}.json`,
    });
  }

  const artifactsSorted = [...data.artifacts].sort((a, b) => {
    const byKind = a.kind.localeCompare(b.kind);
    if (byKind !== 0) return byKind;
    const byKey = a.logicalKey.localeCompare(b.logicalKey);
    return byKey !== 0 ? byKey : a.version - b.version;
  });
  for (const [idx, artifact] of artifactsSorted.entries()) {
    const contentBytes = jsonBytes({
      ...artifact,
      content: safeJsonRecord(artifact.content),
    } satisfies JsonValue);

    // Defense-in-depth: prevent massive audit bundles from artifact content.
    const capped =
      contentBytes.byteLength > budgets.maxWebExtractCharsPerUrl * 10
        ? contentBytes.slice(0, budgets.maxWebExtractCharsPerUrl * 10)
        : contentBytes;

    files.push({
      contentBytes: capped,
      path: `artifacts/${pad3(idx + 1)}.${artifact.kind}.${artifact.logicalKey}.v${artifact.version}.json`,
    });
  }

  return files;
}

/**
 * Collect implementation audit bundle data from Neon (no secrets, redacted).
 *
 * @param input - Project/run identifiers.
 * @returns Redacted, JSON-serializable audit bundle data.
 */
export async function collectImplementationAuditBundleDataFromDb(
  input: Readonly<{ projectId: string; runId: string }>,
): Promise<ImplementationAuditBundleData> {
  const db = getDb();

  const project = await db.query.projectsTable.findFirst({
    columns: { id: true, name: true, slug: true },
    where: eq(schema.projectsTable.id, input.projectId),
  });
  if (!project) throw new AppError("not_found", 404, "Project not found.");

  const run = await db.query.runsTable.findFirst({
    where: and(
      eq(schema.runsTable.id, input.runId),
      eq(schema.runsTable.projectId, input.projectId),
    ),
  });
  if (!run) throw new AppError("not_found", 404, "Run not found.");

  const stepRows = await db.query.runStepsTable.findMany({
    orderBy: (t) => [asc(t.stepId)],
    where: eq(schema.runStepsTable.runId, input.runId),
  });

  const steps = stepRows.map((s) => ({
    attempt: s.attempt,
    createdAt: s.createdAt.toISOString(),
    endedAt: toIso(s.endedAt),
    error: (s.error ?? null) as Record<string, unknown> | null,
    id: s.id,
    inputs: s.inputs,
    outputs: s.outputs,
    startedAt: toIso(s.startedAt),
    status: s.status,
    stepId: s.stepId,
    stepKind: s.stepKind,
    stepName: s.stepName,
    updatedAt: s.updatedAt.toISOString(),
  }));

  const sandboxJobRows = await db.query.sandboxJobsTable.findMany({
    orderBy: (t) => [asc(t.jobType), asc(t.id)],
    where: eq(schema.sandboxJobsTable.runId, input.runId),
  });

  const sandboxJobs = sandboxJobRows.map((j) => ({
    createdAt: j.createdAt.toISOString(),
    endedAt: toIso(j.endedAt),
    exitCode: j.exitCode ?? null,
    id: j.id,
    jobType: j.jobType,
    metadata: j.metadata,
    startedAt: toIso(j.startedAt),
    status: j.status,
    transcriptBlobRef: j.transcriptBlobRef ?? null,
    updatedAt: j.updatedAt.toISOString(),
  }));

  const approvalsRows = await db.query.approvalsTable.findMany({
    orderBy: (t) => [asc(t.scope), asc(t.id)],
    where: eq(schema.approvalsTable.runId, input.runId),
  });

  const approvals = approvalsRows.map((a) => ({
    approvedAt: toIso(a.approvedAt),
    approvedBy: a.approvedBy ?? null,
    createdAt: a.createdAt.toISOString(),
    id: a.id,
    intentSummary: a.intentSummary,
    metadata: a.metadata,
    scope: a.scope,
  }));

  const deploymentsRows = await db.query.deploymentsTable.findMany({
    orderBy: (t) => [asc(t.status), asc(t.id)],
    where: and(
      eq(schema.deploymentsTable.projectId, input.projectId),
      eq(schema.deploymentsTable.runId, input.runId),
    ),
  });

  const deployments = deploymentsRows.map((d) => ({
    createdAt: d.createdAt.toISOString(),
    deploymentUrl: d.deploymentUrl ?? null,
    endedAt: toIso(d.endedAt),
    id: d.id,
    metadata: d.metadata,
    provider: d.provider,
    startedAt: toIso(d.startedAt),
    status: d.status,
    updatedAt: d.updatedAt.toISOString(),
    vercelDeploymentId: d.vercelDeploymentId ?? null,
    vercelProjectId: d.vercelProjectId ?? null,
  }));

  const artifactsRows = await db.query.artifactsTable.findMany({
    orderBy: (t) => [asc(t.kind), asc(t.logicalKey), asc(t.version)],
    where: and(
      eq(schema.artifactsTable.projectId, input.projectId),
      eq(schema.artifactsTable.runId, input.runId),
    ),
  });

  const artifacts = artifactsRows.map((a) => ({
    content: a.content,
    createdAt: a.createdAt.toISOString(),
    id: a.id,
    kind: a.kind,
    logicalKey: a.logicalKey,
    version: a.version,
  }));

  // Best-effort: resolve repoId from the persisted repo ensure step outputs.
  const repoId = steps.find((s) => s.stepId === "impl.repo.ensure")?.outputs
    ?.repoId;
  const repo =
    typeof repoId === "string"
      ? await db.query.reposTable.findFirst({
          where: eq(schema.reposTable.id, repoId),
        })
      : null;

  return {
    approvals,
    artifacts,
    deployments,
    project: { id: project.id, name: project.name, slug: project.slug },
    repo: repo
      ? {
          cloneUrl: repo.cloneUrl,
          createdAt: repo.createdAt.toISOString(),
          defaultBranch: repo.defaultBranch,
          htmlUrl: repo.htmlUrl,
          id: repo.id,
          name: repo.name,
          owner: repo.owner,
          provider: repo.provider,
          updatedAt: repo.updatedAt.toISOString(),
        }
      : null,
    run: {
      createdAt: run.createdAt.toISOString(),
      id: run.id,
      kind: run.kind,
      metadata: run.metadata,
      status: run.status,
      updatedAt: run.updatedAt.toISOString(),
      workflowRunId: run.workflowRunId ?? null,
    },
    sandboxJobs,
    steps,
  };
}

export type ImplementationAuditBundleBuildResult = Readonly<{
  blobPath: string;
  blobUrl: string;
  sha256: string;
  bytes: number;
  manifest: ExportManifest;
}>;

/**
 * Build and upload the implementation audit bundle ZIP to Vercel Blob.
 *
 * @param input - Project/run identifiers.
 * @returns Blob URL + sha256 and export manifest.
 */
export async function buildAndUploadImplementationAuditBundle(
  input: Readonly<{ projectId: string; runId: string }>,
): Promise<ImplementationAuditBundleBuildResult> {
  const data = await collectImplementationAuditBundleDataFromDb(input);

  const files = buildImplementationAuditBundleFilesFromData(data);
  const zip = await buildExportZipBytes({
    files,
    project: data.project,
  });

  const sha256 = sha256Hex(zip.bytes);
  const requestedBlobPath = getImplementationAuditBundleBlobPath(input);
  const uploaded = await putImplementationAuditBundleBlob({
    blobPath: requestedBlobPath,
    bytes: zip.bytes,
  });

  return {
    blobPath: uploaded.blobPath,
    blobUrl: uploaded.blobUrl,
    bytes: zip.bytes.byteLength,
    manifest: zip.manifest,
    sha256,
  };
}
