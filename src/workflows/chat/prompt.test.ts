import { describe, expect, it } from "vitest";

import { PROJECT_CHAT_SYSTEM_PROMPT } from "@/workflows/chat/prompt";

describe("PROJECT_CHAT_SYSTEM_PROMPT", () => {
  it("is non-empty and stable-looking", () => {
    expect(PROJECT_CHAT_SYSTEM_PROMPT.length).toBeGreaterThan(20);
    expect(PROJECT_CHAT_SYSTEM_PROMPT).toContain("retrieveProjectChunks");
  });
});
