import { describe, expect, it } from "vitest";
import {
  ALLOWED_EXTENSIONS,
  getFileExtension,
  isAllowedFileName,
  isAllowedFileSize,
  isValidUploadCount,
  MAX_FILE_BYTES,
  MAX_UPLOAD_COUNT,
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
