import { describe, expect, it } from "vitest";

import { createMemoryEditorialRepository } from "../editorial/memory-editorial-repository";

import { EditorialPublishedArticleSource } from "./published-article-source";

describe("EditorialPublishedArticleSource", () => {
  it("returns published articles newer than the boundary, newest first, and nothing for newer boundaries", async () => {
    const repository = createMemoryEditorialRepository();
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
      claimStatus: published[0].claimStatus,
      entitySlugs: published[0].entities.map((entity) => entity.slug),
    });

    const newer = await source.listPublishedAfter("en", new Date(published[1].publishedAt!));
    expect(newer.every((item) => Date.parse(item.publishedAt) > Date.parse(published[1].publishedAt!))).toBe(true);
    expect(await source.listPublishedAfter("en", new Date(published[0].publishedAt!))).toEqual([]);
  });

  it("carries the claim status and the linked entity slugs, primary first", async () => {
    const [seed] = (await createMemoryEditorialRepository().listPublished({ locale: "en", limit: 1 })).items;
    const source = new EditorialPublishedArticleSource({
      listPublished: async () => ({
        nextCursor: null,
        items: [{
          ...seed,
          claimStatus: "rumour",
          entities: [
            { kind: "company", slug: "anthropic", name: "Anthropic", isPrimary: true },
            { kind: "model", slug: "claude", name: "Claude", isPrimary: false },
          ],
        }],
      }),
    });

    const [item] = await source.listPublishedAfter("en", new Date(0));
    expect(item).toMatchObject({ claimStatus: "rumour", entitySlugs: ["anthropic", "claude"] });
  });
});
