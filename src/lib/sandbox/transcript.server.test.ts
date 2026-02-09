import { describe, expect, it, vi } from "vitest";

const redactionState = vi.hoisted(() => ({
  redact: vi.fn(
    (
      input: string,
      options?: Readonly<{ extraSecrets?: readonly string[] }>,
    ) => {
      const secrets = options?.extraSecrets ?? [];
      let out = input;
      for (const secret of secrets) {
        if (secret) out = out.split(secret).join("[REDACTED]");
      }
      return out;
    },
  ),
}));

vi.mock("@/lib/sandbox/redaction.server", () => ({
  redactSandboxLog: (
    input: string,
    options?: Readonly<{ extraSecrets?: readonly string[] }>,
  ) => redactionState.redact(input, options),
}));

describe("SandboxTranscriptCollector", () => {
  it("routes stdout/stderr, redacts secrets, and reports truncation state", async () => {
    const { SandboxTranscriptCollector } = await import(
      "@/lib/sandbox/transcript.server"
    );

    const collector = new SandboxTranscriptCollector({
      maxCombinedChars: 100,
      maxStreamChars: 100,
    });

    collector.append(
      { data: "hello secret\n", stream: "stdout" },
      { extraSecrets: ["secret"] },
    );
    collector.append(
      { data: "oops secret\n", stream: "stderr" },
      { extraSecrets: ["secret"] },
    );

    const snap = collector.snapshot();
    expect(snap.stdout).toContain("[REDACTED]");
    expect(snap.stderr).toContain("[REDACTED]");
    expect(snap.combined).toContain("[REDACTED]");
    expect(snap.truncated).toBe(false);
    expect(redactionState.redact).toHaveBeenCalled();
  });

  it("truncates transcript tails to configured limits", async () => {
    const { SandboxTranscriptCollector } = await import(
      "@/lib/sandbox/transcript.server"
    );

    const collector = new SandboxTranscriptCollector({
      maxCombinedChars: 10,
      maxStreamChars: 6,
    });

    collector.append({ data: "12345", stream: "stdout" });
    collector.append({ data: "67890", stream: "stdout" });
    collector.append({ data: "abc", stream: "stderr" });

    const snap = collector.snapshot();
    expect(snap.combined.length).toBeLessThanOrEqual(10);
    expect(snap.stdout.length).toBeLessThanOrEqual(6);
    expect(snap.stderr.length).toBeLessThanOrEqual(6);
    expect(snap.truncated).toBe(true);
  });

  it("compacts internal buffers when the prefix grows large", async () => {
    const { SandboxTranscriptCollector } = await import(
      "@/lib/sandbox/transcript.server"
    );

    const collector = new SandboxTranscriptCollector({
      maxCombinedChars: 1,
      maxStreamChars: 1,
    });

    for (let i = 0; i < 100; i += 1) {
      collector.append({ data: "x", stream: "stdout" });
    }

    const snap = collector.snapshot();
    expect(snap.combined).toBe("x");
    expect(snap.stdout).toBe("x");
    expect(snap.truncated).toBe(true);
  });
});
