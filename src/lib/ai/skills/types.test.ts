import { describe, expect, it } from "vitest";

describe("skills types module", () => {
  it("can be imported (server-only boundary)", async () => {
    await expect(import("@/lib/ai/skills/types")).resolves.toBeTruthy();
  });
});
