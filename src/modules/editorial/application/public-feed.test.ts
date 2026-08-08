import { describe, expect, it } from "vitest";
import {
  decodeArticleCursor,
  encodeArticleCursor,
  toArticleListItem,
} from "./public-feed";
import { seedArticles } from "../infrastructure/seed";

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

  it("exposes only fields needed by an archive row", () => {
    const item = toArticleListItem(seedArticles[0]);

    expect(item).toEqual({
      id: seedArticles[0].id,
      locale: seedArticles[0].locale,
      slug: seedArticles[0].slug,
      title: seedArticles[0].title,
      excerpt: seedArticles[0].excerpt,
      coverImage: seedArticles[0].coverImage,
      category: {
        slug: seedArticles[0].category.slug,
        name: seedArticles[0].category.name,
      },
    });
    expect(item).not.toHaveProperty("content");
  });
});
