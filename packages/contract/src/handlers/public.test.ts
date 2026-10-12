import { describe, expect, it, vi } from "vitest";

import type { Article } from "@atlasnews/core/editorial/domain/article";

import type { PublicArticleReader } from "../ports";
import { searchPublishedAcrossLocales } from "./public";

const story = (locale: "en" | "it", slug: string, publishedAt: string | null, updatedAt = publishedAt ?? "2026-01-01T00:00:00.000Z") =>
  ({ locale, slug, publishedAt, updatedAt }) as Article;

function readerOf(byLocale: Record<"en" | "it", Article[]>) {
  const listPublished = vi.fn(async ({ locale }: { locale: "en" | "it" }) => ({ items: byLocale[locale], nextCursor: null }));
  return { reader: { listPublished } as unknown as Pick<PublicArticleReader, "listPublished">, listPublished };
}

describe("searchPublishedAcrossLocales", () => {
  it("merges every locale newest first and keeps only the limit", async () => {
    const { reader } = readerOf({
      en: [story("en", "old", "2026-08-01T00:00:00.000Z"), story("en", "new", "2026-10-01T00:00:00.000Z")],
      it: [story("it", "middle", "2026-09-01T00:00:00.000Z"), story("it", "draft-like", null, "2026-09-15T00:00:00.000Z")],
    });

    const found = await searchPublishedAcrossLocales(reader, { perLocale: 5, limit: 3 });

    // An article without a publication date sorts by its last update.
    expect(found.map((article) => article.slug)).toEqual(["new", "draft-like", "middle"]);
  });

  it("asks each locale for its own page and passes the query only when there is one", async () => {
    const { reader, listPublished } = readerOf({ en: [], it: [] });

    await searchPublishedAcrossLocales(reader, { query: "agents", perLocale: 7, limit: 10 });
    await searchPublishedAcrossLocales(reader, { perLocale: 5, limit: 10 });

    expect(listPublished.mock.calls.map(([input]) => input)).toEqual([
      { locale: "en", limit: 7, query: "agents" },
      { locale: "it", limit: 7, query: "agents" },
      { locale: "en", limit: 5 },
      { locale: "it", limit: 5 },
    ]);
  });
});
