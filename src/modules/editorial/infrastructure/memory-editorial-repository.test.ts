import { describe, expect, it } from "vitest";
import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { seedArticles, seedCategories } from "./seed";

describe("MemoryEditorialRepository", () => {
  it("only returns published articles to public queries", async () => {
    const repository = new MemoryEditorialRepository();
    const page = await repository.listPublished({ locale: "en", limit: 50 });

    expect(page.items.length).toBeGreaterThan(5);
    expect(
      page.items.every(
        (article) => article.status === "published" && article.locale === "en",
      ),
    ).toBe(true);
  });

  it("filters public articles by locale, category, and localized text", async () => {
    const repository = new MemoryEditorialRepository();
    const english = await repository.listPublished({
      locale: "en",
      category: "policy",
      query: "rules",
    });
    const italian = await repository.listPublished({
      locale: "it",
      category: "policy",
      query: "regole",
    });

    expect(english.items).toHaveLength(1);
    expect(english.items[0].locale).toBe("en");
    expect(italian.items).toHaveLength(1);
    expect(italian.items[0].locale).toBe("it");
    expect(english.items[0].translationKey).toBe(
      italian.items[0].translationKey,
    );
  });

  it("does not resolve a localized slug from another locale", async () => {
    const repository = new MemoryEditorialRepository();

    await expect(
      repository.findBySlug("ai-agents-enter-everyday-work", "it"),
    ).resolves.toBeNull();
    await expect(
      repository.findBySlug("ai-agents-enter-everyday-work", "en"),
    ).resolves.toMatchObject({ locale: "en", translationKey: "agents-at-work" });
  });

  it("creates and updates an editorial draft", async () => {
    const repository = new MemoryEditorialRepository();
    const created = await repository.save({
      locale: "en",
      title: "An editorial test",
      excerpt: "A sufficiently descriptive editorial summary",
      content: "A complete body for the editorial test article.",
      categorySlug: "research",
      status: "draft",
    });
    const updated = await repository.save({
      id: created.id,
      locale: "en",
      title: "A published editorial test",
      excerpt: "An updated and sufficiently descriptive summary",
      content: "The complete and updated body of the test article.",
      categorySlug: "research",
      status: "published",
    });

    expect(updated.slug).toBe("a-published-editorial-test");
    expect(updated.locale).toBe("en");
    expect(updated.translationKey).toBe(created.translationKey);
    expect(updated.publishedAt).not.toBeNull();
  });

  it("ships eight complete translation pairs and localized categories", () => {
    const english = seedArticles.filter((article) => article.locale === "en");
    const italian = seedArticles.filter((article) => article.locale === "it");

    expect(english).toHaveLength(8);
    expect(italian).toHaveLength(8);
    expect(new Set(english.map((article) => article.translationKey))).toEqual(
      new Set(italian.map((article) => article.translationKey)),
    );
    expect(
      seedArticles.every(
        (article) =>
          article.title.length > 0 &&
          article.excerpt.length > 0 &&
          article.content.length > 20 &&
          article.category.locale === article.locale,
      ),
    ).toBe(true);
    expect(seedCategories.filter((category) => category.locale === "en")).toHaveLength(5);
    expect(seedCategories.filter((category) => category.locale === "it")).toHaveLength(5);
  });

  it("returns the same newsletter result for new and existing addresses", async () => {
    const repository = new MemoryEditorialRepository();

    await expect(repository.subscribe("reader@example.com", "test", "en")).resolves.toBeUndefined();
    await expect(repository.subscribe("reader@example.com", "test", "it")).resolves.toBeUndefined();
  });
});
