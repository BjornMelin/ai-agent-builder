import { describe, expect, it } from "vitest";
import { z } from "zod";

import { newId } from "@/lib/core/ids";

describe("ids", () => {
  it("returns a UUID", () => {
    const id = newId();
    expect(z.uuid().safeParse(id).success).toBe(true);
  });

  it("returns unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      ids.add(newId());
    }
    expect(ids.size).toBe(100);
  });
});
