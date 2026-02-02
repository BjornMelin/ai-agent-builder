import { describe, expect, it, vi } from "vitest";

type QstashClientInit = Readonly<{ token: string }>;
type VerifyInit = Readonly<{
  currentSigningKey: string;
  nextSigningKey: string;
}>;

const qstashClientInits: QstashClientInit[] = [];
const verifyInits: VerifyInit[] = [];

vi.mock("@upstash/qstash", () => {
  class ClientMock {
    public readonly init: QstashClientInit;

    public constructor(init: QstashClientInit) {
      this.init = init;
      qstashClientInits.push(init);
    }
  }

  return { Client: ClientMock };
});

vi.mock("@upstash/qstash/nextjs", () => {
  return {
    verifySignatureAppRouter: (handler: unknown, init?: VerifyInit) => {
      if (init) {
        verifyInits.push(init);
      }
      return handler;
    },
  };
});

async function withEnv<T>(
  overrides: Readonly<Record<string, string | undefined>>,
  fn: () => Promise<T>,
): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    prev[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

describe("qstash helpers", () => {
  it("fails when QStash publish env is missing", async () => {
    await withEnv({ QSTASH_TOKEN: undefined }, async () => {
      vi.resetModules();
      const { getQstashClient } = await import("@/lib/upstash/qstash.server");
      expect(() => getQstashClient()).toThrowError(/QSTASH_TOKEN/i);
    });
  });

  it("creates a single client and uses trimmed env", async () => {
    await withEnv(
      {
        QSTASH_CURRENT_SIGNING_KEY: "  cur  ",
        QSTASH_NEXT_SIGNING_KEY: "  next  ",
        QSTASH_TOKEN: "  tok  ",
      },
      async () => {
        vi.resetModules();
        qstashClientInits.length = 0;

        const { getQstashClient } = await import("@/lib/upstash/qstash.server");
        const a = getQstashClient();
        const b = getQstashClient();

        expect(a).toBe(b);
        expect(qstashClientInits).toEqual([{ token: "tok" }]);
      },
    );
  });

  it("passes signing keys to the App Router verifier wrapper", async () => {
    await withEnv(
      {
        QSTASH_CURRENT_SIGNING_KEY: "cur",
        QSTASH_NEXT_SIGNING_KEY: "next",
        QSTASH_TOKEN: "tok",
      },
      async () => {
        vi.resetModules();
        verifyInits.length = 0;

        const { verifyQstashSignatureAppRouter } = await import(
          "@/lib/upstash/qstash.server"
        );

        const handler = async () => new Response("ok");
        const wrapped = verifyQstashSignatureAppRouter(handler);
        await wrapped(new Request("http://localhost/test"));

        expect(verifyInits).toEqual([
          { currentSigningKey: "cur", nextSigningKey: "next" },
        ]);
      },
    );
  });
});
