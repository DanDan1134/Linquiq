import { describe, expect, it } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  getFileExtension,
  isAllowedFileName,
  isAllowedFileSize,
  isContentTypeAllowedForFileName,
  isValidUploadCount,
  matchesMagicBytes,
  mimeForFileName,
  validateUploadMeta,
  MAX_FILE_BYTES,
  MAX_UPLOAD_COUNT,
  sanitizeDisplayName,
  safeContentDispositionFilename,
} from "./uploadValidation";

describe("isValidUploadCount", () => {
  it("accepts integers from 1 to MAX_UPLOAD_COUNT", () => {
    expect(isValidUploadCount(1)).toBe(true);
    expect(isValidUploadCount(MAX_UPLOAD_COUNT)).toBe(true);
    expect(isValidUploadCount("5")).toBe(true);
  });

  it("rejects out of range or non-integers", () => {
    expect(isValidUploadCount(0)).toBe(false);
    expect(isValidUploadCount(MAX_UPLOAD_COUNT + 1)).toBe(false);
    expect(isValidUploadCount(1.5)).toBe(false);
    expect(isValidUploadCount("abc")).toBe(false);
    expect(isValidUploadCount(null)).toBe(false);
  });
});

describe("isAllowedFileName", () => {
  it("accepts allowed extensions", () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(isAllowedFileName(`photo.${ext}`)).toBe(true);
    }
  });

  it("rejects path traversal and bad extensions", () => {
    expect(isAllowedFileName("../secret.txt")).toBe(false);
    expect(isAllowedFileName("folder/file.png")).toBe(false);
    expect(isAllowedFileName("evil.exe")).toBe(false);
    expect(isAllowedFileName("noext")).toBe(false);
    expect(isAllowedFileName("")).toBe(false);
  });
});

describe("getFileExtension / isAllowedFileSize", () => {
  it("parses extension case-insensitively", () => {
    expect(getFileExtension("Doc.PDF")).toBe("pdf");
  });

  it("enforces max size", () => {
    expect(isAllowedFileSize(0)).toBe(true);
    expect(isAllowedFileSize(MAX_FILE_BYTES)).toBe(true);
    expect(isAllowedFileSize(MAX_FILE_BYTES + 1)).toBe(false);
    expect(isAllowedFileSize(undefined)).toBe(false);
  });
});

describe("MIME / content-type pairing", () => {
  it("maps extensions to canonical MIME", () => {
    expect(mimeForFileName("a.pdf")).toBe("application/pdf");
    expect(mimeForFileName("a.jpg")).toBe("image/jpeg");
    expect(mimeForFileName("note.md")).toBe("text/markdown");
  });

  it("accepts matching content types and rejects HTML/octet-stream", () => {
    expect(isContentTypeAllowedForFileName("a.pdf", "application/pdf")).toBe(true);
    expect(isContentTypeAllowedForFileName("a.pdf", "text/html")).toBe(false);
    expect(
      isContentTypeAllowedForFileName("a.pdf", "application/octet-stream")
    ).toBe(false);
    expect(isContentTypeAllowedForFileName("a.md", "text/plain")).toBe(true);
  });

  it("validateUploadMeta normalizes to canonical MIME", () => {
    const meta = validateUploadMeta({
      fileName: "photo.jpg",
      contentType: "image/jpg",
      contentLength: 1024,
    });
    expect(meta.contentType).toBe("image/jpeg");
    expect(meta.contentLength).toBe(1024);
  });

  it("validateUploadMeta rejects oversized files", () => {
    expect(() =>
      validateUploadMeta({
        fileName: "big.pdf",
        contentType: "application/pdf",
        contentLength: MAX_FILE_BYTES + 1,
      })
    ).toThrow("FILE_TOO_LARGE");
  });
});

describe("sanitizeDisplayName", () => {
  it("keeps normal linq titles and strips header-breaking chars", () => {
    expect(sanitizeDisplayName("2026 conference")).toBe("2026 conference");
    expect(sanitizeDisplayName("file.pdf\r\nContent-Type: text/html")).toBe(
      "file.pdfContent-Type: text/html"
    );
    expect(safeContentDispositionFilename('a"b\nc.pdf')).toBe("abc.pdf");
  });
});

describe("matchesMagicBytes", () => {
  it("accepts PDF and JPEG headers", () => {
    expect(
      matchesMagicBytes("doc.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]))
    ).toBe(true);
    expect(
      matchesMagicBytes("pic.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))
    ).toBe(true);
  });

  it("rejects HTML disguised as PDF", () => {
    const html = new TextEncoder().encode("<!doctype html>");
    expect(matchesMagicBytes("evil.pdf", html)).toBe(false);
  });
});
