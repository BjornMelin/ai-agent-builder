import { describe, expect, it } from "vitest";

import { chunkDocument } from "@/lib/ingest/chunk/chunk-document.server";

describe("chunkDocument", () => {
  it("produces deterministic chunks with page provenance when ref is page:<n>", () => {
    const chunks = chunkDocument({
      extracted: {
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        sections: [{ ref: "page:3", text: "Hello world." }],
      },
      projectId: "proj_1",
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      fileId: "file_1",
      id: "file_1:0",
      pageEnd: 3,
      pageStart: 3,
      projectId: "proj_1",
    });
    expect(typeof chunks[0]?.contentHash).toBe("string");
    expect(typeof chunks[0]?.tokenCount).toBe("number");
  });

  it("splits long sections by maxCharsPerChunk with stable chunkIndex increments", () => {
    const long = [
      "Sentence one.",
      "Sentence two is here.",
      "Sentence three is also here.",
      "Sentence four follows.",
    ].join(" ");

    const chunks = chunkDocument({
      extracted: {
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        sections: [{ ref: "text", text: long }],
      },
      maxCharsPerChunk: 30,
      projectId: "proj_1",
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(
      chunks.map((_c, idx) => idx),
    );
    expect(chunks.every((c) => c.content.length <= 30)).toBe(true);
  });

  it("returns [] when all sections normalize to empty text", () => {
    const chunks = chunkDocument({
      extracted: {
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
        sections: [{ ref: "text", text: "   \n\t  " }],
      },
      projectId: "proj_1",
    });

    expect(chunks).toEqual([]);
  });
});
