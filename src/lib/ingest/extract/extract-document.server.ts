import "server-only";

import { Buffer } from "node:buffer";

import { AppError } from "@/lib/core/errors";
import type { ExtractedDoc, ExtractedSection } from "@/lib/ingest/types";

const textDecoder = new TextDecoder("utf-8", { fatal: false });

function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function extractPdf(
  bytes: Uint8Array,
): Promise<readonly ExtractedSection[]> {
  const { PDFParse } = await import("pdf-parse");

  const parser = new PDFParse({ data: bytes });
  try {
    const res = await parser.getText();

    return res.pages
      .map((p) => ({
        meta: { page: p.num },
        ref: `page:${p.num}`,
        text: normalizeWhitespace(p.text),
      }))
      .filter((p) => p.text.length > 0);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

const allowedXmlTextTags = new Set(["w:t", "a:t"]);

function decodeXmlEntities(input: string): string {
  return input.replace(
    /&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g,
    (_match, entity: string) => {
      if (entity.startsWith("#x")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : _match;
      }
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : _match;
      }
      switch (entity) {
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        case "amp":
          return "&";
        default:
          return _match;
      }
    },
  );
}

/**
 * Extract text content from XML by tag name.
 *
 * @remarks
 * IMPORTANT: tagName is allowlisted to trusted literals to avoid ReDoS.
 *
 * @param xml - XML string to scan for tag contents.
 * @param tagName - Tag name to extract (allowlisted literal).
 * @returns Joined text content for matching tags.
 */
function extractXmlTextByTag(xml: string, tagName: string): string {
  if (!allowedXmlTextTags.has(tagName)) {
    throw new AppError("extract_failed", 500, "Unsupported XML tag name.");
  }
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "g");
  const parts: string[] = [];
  // Avoid assignment-in-expression for readability and linting.
  for (;;) {
    const match = re.exec(xml);
    if (!match) {
      break;
    }
    const raw = match[1] ?? "";
    parts.push(decodeXmlEntities(raw));
  }
  return parts.join(" ").trim();
}

async function extractDocx(
  bytes: Uint8Array,
): Promise<readonly ExtractedSection[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);

  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) {
    throw new AppError(
      "extract_failed",
      400,
      "Invalid DOCX (missing document.xml).",
    );
  }

  // Paragraph-level extraction: split on <w:p ...> blocks for stable refs.
  const paragraphs: ExtractedSection[] = [];
  const paraRe = /<w:p[\s\S]*?<\/w:p>/g;
  const paraBlocks = docXml.match(paraRe) ?? [];
  for (let i = 0; i < paraBlocks.length; i += 1) {
    const block = paraBlocks[i] ?? "";
    const text = extractXmlTextByTag(block, "w:t");
    const normalized = normalizeWhitespace(text);
    if (normalized.length === 0) continue;
    paragraphs.push({
      meta: { paragraph: i + 1 },
      ref: `p:${i + 1}`,
      text: normalized,
    });
  }

  // Fallback: if paragraph splitting found nothing, try raw text extraction.
  if (paragraphs.length === 0) {
    const text = extractXmlTextByTag(docXml, "w:t");
    const normalized = normalizeWhitespace(text);
    if (normalized.length > 0) {
      paragraphs.push({ ref: "doc", text: normalized });
    }
  }

  return paragraphs;
}

async function extractPptx(
  bytes: Uint8Array,
): Promise<readonly ExtractedSection[]> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);

  // Slides are stored as ppt/slides/slide1.xml, slide2.xml, ...
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const bi = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return ai - bi;
    });

  if (slidePaths.length === 0) {
    throw new AppError(
      "extract_failed",
      400,
      "Invalid PPTX (no slides found).",
    );
  }

  const slides: ExtractedSection[] = [];
  for (const path of slidePaths) {
    const slideXml = await zip.file(path)?.async("string");
    if (!slideXml) continue;
    const slideNumber = Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    const text = extractXmlTextByTag(slideXml, "a:t");
    const normalized = normalizeWhitespace(text);
    if (normalized.length === 0) continue;
    slides.push({
      meta: { slide: slideNumber },
      ref: `slide:${slideNumber}`,
      text: normalized,
    });
  }

  return slides;
}

async function extractXlsx(
  bytes: Uint8Array,
): Promise<readonly ExtractedSection[]> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const buffer = Buffer.from(bytes);
  await workbook.xlsx.load(buffer);

  const sections: ExtractedSection[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values;
      if (!Array.isArray(values)) return;
      const cells = values
        .slice(1)
        .map((value) => (value === null || value === undefined ? "" : value))
        .map((value) => String(value));
      if (cells.every((value) => value.trim().length === 0)) {
        return;
      }
      rows.push(cells.join(","));
    });
    const csv = rows.join("\n");
    const normalized = normalizeWhitespace(csv);
    if (normalized.length === 0) continue;
    sections.push({
      meta: { sheet: sheet.name },
      ref: `sheet:${sheet.name}`,
      text: normalized,
    });
  }

  return sections;
}

async function extractSections(
  mimeType: string,
  bytes: Uint8Array,
): Promise<readonly ExtractedSection[]> {
  switch (mimeType) {
    case "text/plain":
    case "text/markdown": {
      const text = normalizeWhitespace(decodeUtf8(bytes));
      return text.length === 0 ? [] : [{ ref: "text", text }];
    }
    case "application/pdf":
      return await extractPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return await extractDocx(bytes);
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return await extractPptx(bytes);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return await extractXlsx(bytes);
    default:
      throw new AppError(
        "unsupported_file_type",
        400,
        `Unsupported file type: ${mimeType}`,
      );
  }
}

/**
 * Extract a document into a normalized section-based text model.
 *
 * @param input - Document metadata and binary content including fileId, name, mimeType, and raw bytes.
 * @returns Normalized extracted document.
 * @throws AppError - With code "unsupported_file_type" if mimeType is not supported.
 * @throws AppError - With code "extract_failed" if document is invalid or contains no extractable text.
 */
export async function extractDocument(
  input: Readonly<{
    fileId: string;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }>,
): Promise<ExtractedDoc> {
  const sections = await extractSections(input.mimeType, input.bytes);

  if (sections.length === 0) {
    throw new AppError("extract_failed", 400, "No extractable text found.");
  }

  return {
    fileId: input.fileId,
    mimeType: input.mimeType,
    name: input.name,
    sections,
  };
}
