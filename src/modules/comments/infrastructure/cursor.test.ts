import { describe, expect, it } from "vitest";
import {
  decodeAuditCursor,
  decodeCommentCursor,
  encodeAuditCursor,
  encodeCommentCursor,
} from "./cursor";

describe("comment keyset cursors", () => {
  it("round-trips the stable timestamp and UUID tuple", () => {
    const cursor = {
      createdAt: "2026-08-10T08:00:00.000Z",
      id: "f0d16765-a03d-4c55-9e1c-fd6c6c87557f",
    };
    expect(decodeCommentCursor(encodeCommentCursor(cursor)!)).toEqual(cursor);
  });

  it("rejects malformed and structurally invalid cursors", () => {
    expect(decodeCommentCursor("not-base64-json")).toBeNull();
    expect(decodeCommentCursor(Buffer.from(JSON.stringify({ id: "wrong" })).toString("base64url")))
      .toBeNull();
  });

  it("round-trips monotonic audit identifiers", () => {
    expect(decodeAuditCursor(encodeAuditCursor(42)!)).toBe(42);
    expect(decodeAuditCursor(encodeAuditCursor(null) ?? undefined)).toBeNull();
  });
});
