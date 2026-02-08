import { describe, expect, it } from "vitest";

import { budgets } from "@/lib/config/budgets.server";
import { chatTools } from "@/workflows/chat/tools";

type ValidationResult =
  | Readonly<{ success: true; value: unknown }>
  | Readonly<{ success: false; error: unknown }>;

async function validate(
  schema: unknown,
  value: unknown,
): Promise<ValidationResult> {
  const s = schema as {
    validate?: (value: unknown) => ValidationResult | Promise<ValidationResult>;
  };
  if (!s.validate) {
    throw new Error("Expected schema.validate to be defined.");
  }
  return await s.validate(value);
}

describe("chatTools", () => {
  it("exports the expected tool ids", () => {
    expect(Object.keys(chatTools).sort()).toEqual(
      [
        "context7.query-docs",
        "context7.resolve-library-id",
        "research.create-report",
        "retrieveProjectChunks",
        "web.extract",
        "web.search",
      ].sort(),
    );
  });

  it("validates retrieveProjectChunks input", async () => {
    await expect(
      validate(chatTools.retrieveProjectChunks.inputSchema, { query: "hello" }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      validate(chatTools.retrieveProjectChunks.inputSchema, {
        query: "",
        topK: 0,
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it("validates web.search input", async () => {
    await expect(
      validate(chatTools["web.search"].inputSchema, { query: "Next.js" }),
    ).resolves.toMatchObject({ success: true });

    await expect(
      validate(chatTools["web.search"].inputSchema, {
        endPublishedDate: "20260207",
        query: "x",
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it("validates web.extract input", async () => {
    await expect(
      validate(chatTools["web.extract"].inputSchema, {
        maxChars: 10,
        url: "https://example.com",
      }),
    ).resolves.toMatchObject({ success: true });

    await expect(
      validate(chatTools["web.extract"].inputSchema, {
        maxChars: budgets.maxWebExtractCharsPerUrl + 1,
        url: "https://example.com",
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it("validates Context7 inputs", async () => {
    await expect(
      validate(chatTools["context7.resolve-library-id"].inputSchema, {
        libraryName: "react",
        query: "useState",
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      validate(chatTools["context7.resolve-library-id"].inputSchema, {
        libraryName: "",
        query: "x",
      }),
    ).resolves.toMatchObject({ success: false });

    await expect(
      validate(chatTools["context7.query-docs"].inputSchema, {
        libraryId: "/vercel/next.js",
        query: "cache",
      }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      validate(chatTools["context7.query-docs"].inputSchema, {
        libraryId: "",
        query: "x",
      }),
    ).resolves.toMatchObject({ success: false });
  });

  it("validates research.create-report input", async () => {
    await expect(
      validate(chatTools["research.create-report"].inputSchema, { query: "x" }),
    ).resolves.toMatchObject({ success: true });
    await expect(
      validate(chatTools["research.create-report"].inputSchema, { query: "" }),
    ).resolves.toMatchObject({ success: false });
  });
});
