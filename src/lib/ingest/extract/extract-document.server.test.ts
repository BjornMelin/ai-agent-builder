import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppError } from "@/lib/core/errors";

const state = vi.hoisted(() => ({
  docxXml: "",
  pptxFiles: {} as Record<string, true>,
  pptxXmlByPath: new Map<string, string>(),
  xlsxSheets: [] as Array<{
    name: string;
    rows: Array<readonly unknown[]>;
  }>,
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class PDFParseMock {
    public async getText() {
      return {
        pages: [
          { num: 1, text: "Hello PDF" },
          { num: 2, text: "   " },
        ],
      };
    }
    public async destroy() {}
  },
}));

vi.mock("jszip", () => ({
  default: {
    loadAsync: async (_bytes: Uint8Array) => {
      void _bytes;
      return {
        file: (path: string) => {
          if (path === "word/document.xml") {
            return {
              async: async (_format: string) => {
                void _format;
                return state.docxXml;
              },
            };
          }
          const xml = state.pptxXmlByPath.get(path);
          return xml
            ? {
                async: async (_format: string) => {
                  void _format;
                  return xml;
                },
              }
            : undefined;
        },
        files: state.pptxFiles,
      };
    },
  },
}));

vi.mock("exceljs", () => ({
  Workbook: class WorkbookMock {
    public worksheets = state.xlsxSheets.map((s) => ({
      eachRow: (_opts: unknown, cb: (row: { values: unknown[] }) => void) => {
        for (const row of s.rows) {
          cb({ values: [...row] });
        }
      },
      name: s.name,
    }));
    public xlsx = {
      load: async (_buffer: Buffer) => {
        void _buffer;
      },
    };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();

  state.docxXml = "";
  state.pptxFiles = {};
  state.pptxXmlByPath.clear();
  state.xlsxSheets = [];
});

describe("extractDocument", () => {
  it("extracts normalized text from text/plain", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    const bytes = new TextEncoder().encode(" hello  \r\n\r\nworld  ");
    const doc = await extractDocument({
      bytes,
      fileId: "file_1",
      mimeType: "text/plain",
      name: "a.txt",
    });

    expect(doc.sections).toEqual([{ ref: "text", text: "hello\n\nworld" }]);
  });

  it("rejects when no extractable text is found", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    const bytes = new TextEncoder().encode("   \n\t  ");
    await expect(
      extractDocument({
        bytes,
        fileId: "file_1",
        mimeType: "text/plain",
        name: "a.txt",
      }),
    ).rejects.toMatchObject({
      code: "extract_failed",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("rejects unsupported file types", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    await expect(
      extractDocument({
        bytes: new Uint8Array([1, 2, 3]),
        fileId: "file_1",
        mimeType: "application/octet-stream",
        name: "a.bin",
      }),
    ).rejects.toMatchObject({
      code: "unsupported_file_type",
      status: 400,
    } satisfies Partial<AppError>);
  });

  it("extracts pages from PDFs", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    const doc = await extractDocument({
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      fileId: "file_pdf",
      mimeType: "application/pdf",
      name: "a.pdf",
    });

    expect(doc.sections).toEqual([
      {
        meta: { page: 1 },
        ref: "page:1",
        text: "Hello PDF",
      },
    ]);
  });

  it("extracts paragraphs from DOCX and falls back to raw text when paragraph splitting is empty", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    state.docxXml = `<w:p><w:t>Hello</w:t></w:p><w:p><w:t>World</w:t></w:p>`;
    const doc = await extractDocument({
      bytes: new Uint8Array([1]),
      fileId: "file_docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "a.docx",
    });
    expect(doc.sections.map((s) => s.ref)).toEqual(["p:1", "p:2"]);

    state.docxXml = `<w:t>Fallback</w:t>`;
    const doc2 = await extractDocument({
      bytes: new Uint8Array([2]),
      fileId: "file_docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      name: "a.docx",
    });
    expect(doc2.sections).toEqual([{ ref: "doc", text: "Fallback" }]);
  });

  it("extracts slides from PPTX in numeric order", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    state.pptxFiles = {
      "ppt/slides/slide1.xml": true,
      "ppt/slides/slide2.xml": true,
    };
    state.pptxXmlByPath.set("ppt/slides/slide1.xml", `<a:t>One</a:t>`);
    state.pptxXmlByPath.set("ppt/slides/slide2.xml", `<a:t>Two</a:t>`);

    const doc = await extractDocument({
      bytes: new Uint8Array([3]),
      fileId: "file_pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      name: "a.pptx",
    });

    expect(doc.sections.map((s) => s.ref)).toEqual(["slide:1", "slide:2"]);
    expect(doc.sections.map((s) => s.text)).toEqual(["One", "Two"]);
  });

  it("extracts rows from XLSX as CSV-like text", async () => {
    const { extractDocument } = await import(
      "@/lib/ingest/extract/extract-document.server"
    );

    state.xlsxSheets = [
      {
        name: "Sheet1",
        rows: [
          // ExcelJS row.values is 1-indexed; index 0 is ignored by extractor.
          [undefined, "a", "b"],
          [undefined, "", ""],
          [undefined, 1, 2],
        ],
      },
    ];

    const doc = await extractDocument({
      bytes: new Uint8Array([4]),
      fileId: "file_xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      name: "a.xlsx",
    });

    expect(doc.sections).toEqual([
      { meta: { sheet: "Sheet1" }, ref: "sheet:Sheet1", text: "a,b\n1,2" },
    ]);
  });
});
