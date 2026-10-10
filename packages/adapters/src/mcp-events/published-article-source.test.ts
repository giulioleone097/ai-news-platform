import { describe, expect, it } from "vitest";

import { MemoryEditorialRepository } from "../editorial/memory-editorial-repository";

import { EditorialPublishedArticleSource } from "./published-article-source";

describe("EditorialPublishedArticleSource", () => {
  it("returns published articles newer than the boundary, newest first, and nothing for newer boundaries", async () => {
    const repository = new MemoryEditorialRepository();
    const published = (await repository.listPublished({ locale: "en", limit: 50 })).items;
    expect(published.length).toBeGreaterThan(1);
    const source = new EditorialPublishedArticleSource(repository);

    const all = await source.listPublishedAfter("en", new Date(0));
    expect(all.map((item) => item.id)).toEqual(published.map((item) => item.id));
    expect(all[0]).toEqual({
      id: published[0].id,
      slug: published[0].slug,
      locale: "en",
      title: published[0].title,
      excerpt: published[0].excerpt,
      categorySlug: published[0].category.slug,
      categoryName: published[0].category.name,
      publishedAt: new Date(published[0].publishedAt!).toISOString(),
    });

    const newer = await source.listPublishedAfter("en", new Date(published[1].publishedAt!));
    expect(newer.every((item) => Date.parse(item.publishedAt) > Date.parse(published[1].publishedAt!))).toBe(true);
    expect(await source.listPublishedAfter("en", new Date(published[0].publishedAt!))).toEqual([]);
  });
});
