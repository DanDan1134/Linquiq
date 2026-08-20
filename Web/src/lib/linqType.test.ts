import { describe, expect, it } from "vitest";
import { isEntryUuid, isLinqType } from "./linqType";

describe("isLinqType", () => {
  it("treats Link, bundle, and linq as folders", () => {
    expect(isLinqType("Link")).toBe(true);
    expect(isLinqType("bundle")).toBe(true);
    expect(isLinqType("LINQ")).toBe(true);
  });

  it("rejects file types", () => {
    expect(isLinqType("jpg")).toBe(false);
    expect(isLinqType("pdf")).toBe(false);
    expect(isLinqType("")).toBe(false);
  });
});

describe("isEntryUuid", () => {
  it("accepts RFC 4122 ids", () => {
    expect(isEntryUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects opt placeholders and empty values", () => {
    expect(isEntryUuid("opt-linq-1")).toBe(false);
    expect(isEntryUuid("")).toBe(false);
  });
});
