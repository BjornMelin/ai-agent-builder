import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ensureInfraResourceRecord: vi.fn(),
  ensureNeonProvisioning: vi.fn(),
  ensureUpstashProvisioning: vi.fn(),
}));

vi.mock("@/lib/data/infra-resources.server", () => ({
  ensureInfraResourceRecord: (...args: unknown[]) =>
    state.ensureInfraResourceRecord(...args),
}));

vi.mock("@/lib/providers/neon.server", () => ({
  ensureNeonProvisioning: (...args: unknown[]) =>
    state.ensureNeonProvisioning(...args),
}));

vi.mock("@/lib/providers/upstash.server", () => ({
  ensureUpstashProvisioning: (...args: unknown[]) =>
    state.ensureUpstashProvisioning(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  state.ensureInfraResourceRecord.mockResolvedValue({
    createdAt: new Date(0).toISOString(),
    externalId: "ext",
    id: "ir_1",
    metadata: {},
    projectId: "proj_1",
    provider: "vercel",
    region: null,
    resourceType: "x",
    runId: "run_1",
    updatedAt: new Date(0).toISOString(),
  });
});

describe("provisionImplementationInfraStep", () => {
  it("does not create infra records when provisioning is manual", async () => {
    state.ensureNeonProvisioning.mockResolvedValueOnce({
      artifact: { kind: "manual", provider: "neon" },
      kind: "manual",
      provider: "neon",
    });
    state.ensureUpstashProvisioning.mockResolvedValueOnce({
      artifact: { kind: "manual", provider: "upstash" },
      kind: "manual",
      provider: "upstash",
    });

    const { provisionImplementationInfraStep } = await import(
      "./provision.step"
    );
    const res = await provisionImplementationInfraStep({
      projectId: "proj_1",
      projectSlug: "project",
      runId: "run_1",
    });

    expect(res.neon.kind).toBe("manual");
    expect(res.upstash.kind).toBe("manual");
    expect(state.ensureInfraResourceRecord).not.toHaveBeenCalled();
  });

  it("records infra resources for automated provisioning", async () => {
    state.ensureNeonProvisioning.mockResolvedValueOnce({
      artifact: { kind: "manual", provider: "neon" },
      kind: "automated",
      projectId: "neon_proj_1",
      projectName: "neon-name",
      provider: "neon",
    });
    state.ensureUpstashProvisioning.mockResolvedValueOnce({
      artifact: { kind: "manual", provider: "upstash" },
      kind: "automated",
      provider: "upstash",
      redis: {
        created: true,
        databaseId: "redis_1",
        databaseName: "db",
        endpoint: "endpoint",
        primaryRegion: "iad1",
        restUrl: "https://redis",
      },
      vector: {
        created: true,
        dimensionCount: 2,
        endpoint: "endpoint",
        indexId: "vec_1",
        indexName: "idx",
        region: "iad1",
        restUrl: "https://vector",
        similarityFunction: "COSINE",
      },
    });

    const { provisionImplementationInfraStep } = await import(
      "./provision.step"
    );
    await provisionImplementationInfraStep({
      projectId: "proj_1",
      projectSlug: "project",
      runId: "run_1",
    });

    // neon + upstash redis + upstash vector
    expect(state.ensureInfraResourceRecord).toHaveBeenCalledTimes(3);
    const calls = state.ensureInfraResourceRecord.mock.calls.map((c) => c[0]);
    expect(
      calls.some(
        (c) =>
          c &&
          typeof c === "object" &&
          "resourceType" in c &&
          c.resourceType === "neon.project",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c &&
          typeof c === "object" &&
          "resourceType" in c &&
          c.resourceType === "upstash.redis",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c &&
          typeof c === "object" &&
          "resourceType" in c &&
          c.resourceType === "upstash.vector",
      ),
    ).toBe(true);
  });
});
