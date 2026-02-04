import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createUIMessageStreamResponse: vi.fn(),
  getReadable: vi.fn(),
  getRun: vi.fn(),
  requireAppUserApi: vi.fn(),
}));

vi.mock("ai", () => ({
  createUIMessageStreamResponse: state.createUIMessageStreamResponse,
}));

vi.mock("workflow/api", () => ({
  getRun: state.getRun,
}));

vi.mock("@/lib/auth/require-app-user-api.server", () => ({
  requireAppUserApi: state.requireAppUserApi,
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import("@/app/api/chat/[runId]/stream/route");
  return mod.GET;
}

beforeEach(() => {
  vi.clearAllMocks();

  state.requireAppUserApi.mockResolvedValue({ id: "user" });

  state.getReadable.mockReturnValue(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
  );
  state.getRun.mockReturnValue({ getReadable: state.getReadable });
  state.createUIMessageStreamResponse.mockImplementation(
    () => new Response("ok"),
  );
});

describe("GET /api/chat/:runId/stream", () => {
  it("rejects invalid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=-1"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "bad_request" },
    });
  });

  it("returns a stream response for a valid startIndex", async () => {
    const GET = await loadRoute();

    const res = await GET(
      new Request("http://localhost/api/chat/run_1/stream?startIndex=2"),
      { params: Promise.resolve({ runId: "run_1" }) },
    );

    expect(res.status).toBe(200);
    expect(state.getRun).toHaveBeenCalledWith("run_1");
    expect(state.getReadable).toHaveBeenCalledWith({ startIndex: 2 });
    expect(state.createUIMessageStreamResponse).toHaveBeenCalledTimes(1);
  });
});
