import { describe, expect, it } from "vitest";
import {
  decodeArticleCursor,
  encodeArticleCursor,
} from "@atlasnews/core/editorial/application/public-feed";

describe("public feed transport", () => {
  it("round-trips an opaque article cursor", () => {
    const cursor = {
      publishedAt: "2026-08-08T12:00:00.000Z",
      id: "5d54a420-90c1-43cb-9b85-5130471f00a8",
    };

    expect(decodeArticleCursor(encodeArticleCursor(cursor)!)).toEqual(cursor);
  });

  it("rejects malformed and structurally invalid cursors", () => {
    expect(decodeArticleCursor("not-base64-json")).toBeNull();
    expect(
      decodeArticleCursor(
        Buffer.from(JSON.stringify({ publishedAt: "today", id: "" })).toString("base64url"),
      ),
    ).toBeNull();
  });
});
