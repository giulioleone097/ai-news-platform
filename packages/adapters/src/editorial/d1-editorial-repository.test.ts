import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaCommandService } from "@atlasnews/core/editorial/application/media-commands";
import type { ArticleDraftInput } from "@atlasnews/core/editorial/domain/article";
import type { AdminEditorialRepository, NewsletterRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { D1Database } from "../sites/cloudflare";
import { createSitesTestStore, type SitesTestStore } from "../sites/testing";
import {
  createD1EditorialRepository,
  readSitesMediaObject,
  type D1EditorialRepositoryOptions,
} from "./d1-editorial-repository";
import { seedArticles, seedAuthor } from "./seed";
import { resetEditorialSeed, unusedNewsletter } from "./testing";

// Cases specific to the D1 adapter. The cases every backend shares (articles, categories, entities, story
// fields, distribution) run against D1 from content-management.test.ts, story-fields.test.ts and
// memory-editorial-repository.test.ts.

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

let store: SitesTestStore;

beforeAll(async () => {
  store = await createSitesTestStore();
});
afterAll(() => store.dispose());
beforeEach(() => resetEditorialSeed(store.database));

function repository(options: Partial<D1EditorialRepositoryOptions> = {}, database: D1Database = store.database) {
  return createD1EditorialRepository(database, {
    audience: "editorial",
    media: store.media,
    newsletter: unusedNewsletter,
    actorAuthorId: async () => seedAuthor.id,
    ...options,
  });
}

function story(title: string, rest: Partial<ArticleDraftInput> = {}): ArticleDraftInput {
  return {
    locale: "en",
    title,
    excerpt: "A sufficiently descriptive summary of the story.",
    content: "A complete body for the story used in this test.",
    categorySlug: "tools",
    status: "draft",
    ...rest,
  };
}

async function count(table: string) {
  const row = await store.database.prepare(`SELECT count(*) AS total FROM ${table}`).first<{ total: number }>();
  return row?.total ?? 0;
}

async function tableCounts() {
  return Promise.all(["articles", "article_entities", "social_publications", "article_search"].map(count));
}

describe("public audience", () => {
  it("serves published stories only, without their distribution", async () => {
    const editorial = repository();
    const draft = await editorial.save(story("A draft nobody may read", { distribution: ["x"] }));
    const published = (await editorial.listForStudio("en", { status: "published" }))[0];
    expect(published.distribution.length).toBeGreaterThan(0);

    const anonymous = repository({ audience: "public" });
    expect(await anonymous.findById(draft.id, "en")).toBeNull();
    expect(await anonymous.findBySlug(draft.slug, "en")).toBeNull();
    expect((await anonymous.listForStudio("en")).every((item) => item.status === "published")).toBe(true);
    expect(await anonymous.findById(published.id, "en")).toMatchObject({ id: published.id, distribution: [] });
    expect(await anonymous.listPublications("en")).toEqual([]);
    expect((await editorial.listPublications("en")).length).toBeGreaterThan(0);
  });

  it("does not show a story before its publication time", async () => {
    const editorial = repository();
    const anonymous = repository({ audience: "public" });
    const [story1] = await editorial.listForStudio("en", { status: "published" });
    await store.database.prepare("UPDATE articles SET published_at = ? WHERE id = ?").bind("2999-01-01T00:00:00.000Z", story1.id).run();

    expect((await anonymous.listPublished({ locale: "en", limit: 50 })).items.map((item) => item.id)).not.toContain(story1.id);
    expect(await anonymous.findById(story1.id, "en")).toBeNull();
    expect((await editorial.findById(story1.id, "en"))?.id).toBe(story1.id);
  });

  it("refuses every write, and delegates subscribing to the newsletter adapter", async () => {
    const newsletter: NewsletterRepository = { ...unusedNewsletter, subscribe: vi.fn(async () => undefined) };
    const anonymous = repository({ audience: "public", newsletter });
    await expect(anonymous.save(story("A story from the street"))).rejects.toThrow("Editorial access is required");
    await expect(anonymous.delete(seedArticles[0].id)).rejects.toThrow("Editorial access is required");
    await expect(anonymous.createCategories([])).rejects.toThrow("Editorial access is required");
    await expect(anonymous.uploadAsset({ name: "a.png", mimeType: "image/png", bytes: png })).rejects.toThrow("Editorial access is required");
    expect(await count("articles")).toBe(seedArticles.length);

    await anonymous.subscribe("reader@example.com", "site", "en");
    expect(newsletter.subscribe).toHaveBeenCalledWith("reader@example.com", "site", "en");
  });
});

describe("saving articles", () => {
  it("needs the signed-in editor's author", async () => {
    await expect(repository({ actorAuthorId: undefined }).save(story("A story without an author")))
      .rejects.toThrow("An authenticated editor is required");
    await expect(repository({ actorAuthorId: async () => null }).saveMany([story("A story without an author")]))
      .rejects.toThrow("An authenticated editor is required");
  });

  it("stores timestamps in UTC and reads the author and category with the story", async () => {
    const saved = await repository().save(story("A story scheduled with an offset", {
      status: "scheduled",
      scheduledFor: "2030-03-04T10:00:00+02:00",
    }));
    expect(saved.scheduledFor).toBe("2030-03-04T08:00:00.000Z");
    expect(saved.author).toMatchObject({ id: seedAuthor.id, name: seedAuthor.name });
    expect(saved.category).toMatchObject({ slug: "tools", locale: "en" });
  });

  it("rejects what the database would reject, with a message that says why", async () => {
    const editorial = repository();
    const first = await editorial.save(story("A story that owns its slug"));
    await expect(editorial.save(story("Another title", { slug: first.slug }))).rejects.toThrow(/Unable to save article.*UNIQUE/);
    await expect(editorial.save(story("A story in no category", { categorySlug: "nowhere" }))).rejects.toThrow("Unknown article category nowhere");
    await expect(editorial.save({ ...story("A story that is gone"), id: crypto.randomUUID() })).rejects.toThrow(/does not exist in locale en/);
    await expect(editorial.save(story("A story linking a ghost", { entities: [{ slug: "ghost" }] }))).rejects.toThrow("Unknown entity ghost");
    expect(await count("articles")).toBe(seedArticles.length + 1);
  });

  it("writes a batch all or nothing, links and channels included", async () => {
    const editorial = repository();
    const before = await tableCounts();
    await expect(editorial.saveMany([
      story("First story of the batch", { entities: [{ slug: "claude" }], distribution: ["x"] }),
      story("Second story of the batch", { entities: [{ slug: "openai" }], distribution: ["linkedin"] }),
      story("Third story of the batch", { slug: seedArticles[0].slug }),
    ])).rejects.toThrow(/Unable to save articles/);
    expect(await tableCounts()).toEqual(before);
    expect(await editorial.findBySlug("first-story-of-the-batch", "en")).toBeNull();

    const saved = await editorial.saveMany([
      story("First story of the batch", { entities: [{ slug: "claude" }], distribution: ["x"] }),
      story("Second story of the batch", { entities: [{ slug: "openai" }], distribution: ["linkedin"] }),
    ]);
    expect(saved.map((item) => [item.title, item.distribution, item.entities.map((entity) => entity.slug)])).toEqual([
      ["First story of the batch", ["x"], ["claude"]],
      ["Second story of the batch", ["linkedin"], ["openai"]],
    ]);
    await expect(editorial.saveMany([])).rejects.toThrow("between 1 and 25");
  });

  it("never publishes or unpublishes through a batch save", async () => {
    const editorial = repository();
    const [published] = await editorial.listForStudio("en", { status: "published" });
    const draft = await editorial.save(story("A draft that stays a draft"));

    await expect(editorial.saveMany([{ ...story("A draft that stays a draft"), id: draft.id, status: "published" }]))
      .rejects.toThrow(/cannot publish or unpublish/);
    await expect(editorial.saveMany([{ ...story(published.title), id: published.id, categorySlug: published.category.slug, status: "draft" }]))
      .rejects.toThrow(/cannot publish or unpublish/);
    expect((await editorial.findById(draft.id, "en"))?.status).toBe("draft");
    expect((await editorial.findById(published.id, "en"))?.status).toBe("published");

    const [edited] = await editorial.saveMany([{ ...story(published.title), id: published.id, categorySlug: published.category.slug, status: "published", featured: true }]);
    expect(edited).toMatchObject({ status: "published", featured: true, publishedAt: published.publishedAt });
  });

  it("changes nothing when the story moved to another state after it was read", async () => {
    const editorial = repository();
    const draft = await editorial.save(story("A draft that gets published meanwhile", { distribution: ["x"] }));
    // The batch finds the story published by then: the guarded update and everything after it must not apply.
    const racing = {
      prepare: store.database.prepare.bind(store.database),
      batch: async (statements: Parameters<D1Database["batch"]>[0]) => {
        await store.database.prepare("UPDATE articles SET status = 'published', published_at = ? WHERE id = ?")
          .bind(new Date().toISOString(), draft.id).run();
        return store.database.batch(statements);
      },
    } as D1Database;
    const before = await tableCounts();

    await expect(repository({}, racing).saveMany([
      { ...story("A draft that gets published meanwhile"), id: draft.id, distribution: ["linkedin"], entities: [{ slug: "claude" }] },
    ])).rejects.toThrow(/cannot publish or unpublish/);
    expect(await tableCounts()).toEqual(before);
    expect((await repository().findById(draft.id, "en"))?.distribution).toEqual(["x"]);
  });

  it("reports a story deleted after it was read", async () => {
    const editorial = repository();
    const created = await editorial.save(story("A story deleted meanwhile", { distribution: ["x"] }));
    const racing = {
      prepare: store.database.prepare.bind(store.database),
      batch: async (statements: Parameters<D1Database["batch"]>[0]) => {
        await store.database.prepare("DELETE FROM articles WHERE id = ?").bind(created.id).run();
        return store.database.batch(statements);
      },
    } as D1Database;
    await expect(repository({}, racing).saveMany([{ ...story("A story deleted meanwhile"), id: created.id }])).rejects.toThrow("Article not found");
    expect(await count("social_publications")).toBe(seedArticles.reduce((total, article) => total + article.distribution.length, 0));
  });
});

describe("publishing and deleting", () => {
  it("publishes and unpublishes a batch in input order, and rejects a missing story without touching the others", async () => {
    const editorial = repository();
    const [first, second] = await editorial.saveMany([story("First story to go live"), story("Second story to go live")]);
    await expect(editorial.setPublished([first.id, crypto.randomUUID()], true)).rejects.toThrow(/not found/);
    expect((await editorial.findById(first.id, "en"))?.status).toBe("draft");

    const live = await editorial.setPublished([second.id, first.id, second.id], true);
    expect(live.map((item) => [item.id, item.status])).toEqual([[second.id, "published"], [first.id, "published"]]);
    expect(live.every((item) => item.publishedAt && item.scheduledFor === null)).toBe(true);
    const down = await editorial.setPublished([first.id], false);
    expect(down[0]).toMatchObject({ status: "draft", publishedAt: live[1].publishedAt });
  });

  it("deletes a batch with its links, channels and search entries, or nothing", async () => {
    const editorial = repository();
    const [first, second] = await editorial.saveMany([
      story("First story to be deleted", { entities: [{ slug: "claude" }], distribution: ["x"] }),
      story("Second story to be deleted", { distribution: ["linkedin"] }),
    ]);
    const before = await tableCounts();
    await expect(editorial.deleteMany([first.id, crypto.randomUUID()])).rejects.toThrow(/not found/);
    expect(await tableCounts()).toEqual(before);

    await editorial.deleteMany([first.id, second.id]);
    expect(await tableCounts()).toEqual([before[0] - 2, before[1] - 1, before[2] - 2, before[3] - 2]);
    await editorial.delete(first.id);
  });

  it("pages published stories newest first without overlap", async () => {
    const editorial = repository();
    const everyone = (await editorial.listPublished({ locale: "en", limit: 50 })).items;
    const ids: string[] = [];
    let cursor = undefined as Awaited<ReturnType<typeof editorial.listPublished>>["nextCursor"] | undefined;
    do {
      const page = await editorial.listPublished({ locale: "en", limit: 3, cursor: cursor ?? undefined });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(everyone.map((item) => item.id));
    expect(ids.length).toBeGreaterThan(3);
  });
});

describe("search", () => {
  async function titles(query: string, locale: "en" | "it" = "en") {
    return (await repository().listForStudio(locale, { query })).map((item) => item.title);
  }

  it("matches words by prefix, phrases, exclusions and alternatives, and follows edits and deletes", async () => {
    const editorial = repository();
    const [orchard, harbor] = await editorial.saveMany([
      story("Orchards and harvests", { content: "Apples ripen in the quiet orchard before the harvest begins." }),
      story("Harbors and tides", { content: "The harbor fills when the tide comes in over the quiet bay." }),
    ]);

    expect(await titles("apple")).toEqual(["Orchards and harvests"]);
    expect(await titles("quiet")).toHaveLength(2);
    expect(await titles('"quiet orchard"')).toEqual(["Orchards and harvests"]);
    expect(await titles("quiet -orchard")).toEqual(["Harbors and tides"]);
    expect(await titles("apples or tide")).toHaveLength(2);
    expect(await titles("harvest tide")).toEqual([]);
    expect(await titles("   !!! ")).toEqual([]);
    expect(await titles("\"")).toEqual([]);

    await editorial.save({ ...story("Orchards and harvests", { content: "Pears now, and no more fruit of the old kind." }), id: orchard.id });
    expect(await titles("apple")).toEqual([]);
    expect(await titles("pears")).toEqual(["Orchards and harvests"]);
    await editorial.delete(harbor.id);
    expect(await titles("tide")).toEqual([]);
  });

  it("folds case and accents, and searches the public feed by locale", async () => {
    const editorial = repository();
    const saved = await editorial.save(story("Città e perché", { locale: "it", categorySlug: "strumenti", content: "Le città crescono perché la gente arriva." }));
    expect(await titles("CITTA", "it")).toEqual(["Città e perché"]);
    expect(await titles("citta", "en")).toEqual([]);
    await editorial.setPublished([saved.id], true);
    expect((await editorial.listPublished({ locale: "it", query: "perche" })).items.map((item) => item.id)).toEqual([saved.id]);
  });
});

describe("categories", () => {
  const text = (name: string) => ({ slug: name.toLowerCase().replace(/ /g, "-"), name, description: "" });

  it("writes both locales of a category, keeps the translation's id and orders by position", async () => {
    const editorial = repository();
    const [created] = await editorial.createCategories([{ translationKey: "labs", position: 0, translations: { en: text("Labs"), it: text("Laboratori") } }]);
    expect(created).toMatchObject({ translationKey: "labs", position: 0, translations: { en: { slug: "labs" }, it: { slug: "laboratori" } } });
    expect((await editorial.listCategories("en"))[0].slug).toBe("labs");

    const [updated] = await editorial.updateCategories([{ translationKey: "labs", position: 9, translations: { en: { ...text("Labs"), description: "Experiments." } } }]);
    expect(updated.position).toBe(9);
    expect(updated.translations.en).toMatchObject({ id: created.translations.en?.id, description: "Experiments." });
    expect(updated.translations.it).toEqual(created.translations.it);
    expect((await editorial.listCategories("en")).at(-1)?.slug).toBe("labs");
  });

  it("writes a batch all or nothing and reports the missing translation or category", async () => {
    const editorial = repository();
    const before = await editorial.listCategoryRecords();
    await expect(editorial.createCategories([
      { translationKey: "labs", position: 6, translations: { en: text("Labs"), it: text("Laboratori") } },
      { translationKey: "other", position: 7, translations: { en: { ...text("Other"), slug: "research" }, it: text("Altro") } },
    ])).rejects.toThrow(/Unable to create categories/);
    await expect(editorial.createCategories([{ translationKey: "empty", position: 6, translations: {} }])).rejects.toThrow("Item 1: A category needs at least one translation");
    expect(await editorial.listCategoryRecords()).toEqual(before);

    await expect(editorial.updateCategories([{ translationKey: "ghost", position: 1, translations: { en: text("Ghost") } }])).rejects.toThrow('Item 1: Category "ghost" has no "en" translation');
    await expect(editorial.updateCategories([{ translationKey: "ghost", position: 1, translations: {} }])).rejects.toThrow('Item 1: Category "ghost" not found');
  });

  it("refuses to delete a used category, and counts the articles that use one", async () => {
    const editorial = repository();
    expect((await editorial.countCategoryArticles(["tools", "ghost"])).get("tools")).toBeGreaterThan(0);
    await expect(editorial.deleteCategories(["tools"])).rejects.toThrow(/Item 1: Category "tools" is used by \d+ articles/);
    await editorial.createCategories([{ translationKey: "labs", position: 6, translations: { en: text("Labs"), it: text("Laboratori") } }]);
    await expect(editorial.deleteCategories(["labs", "ghost"])).rejects.toThrow('Item 2: Category "ghost" not found');
    expect((await editorial.listCategoryRecords()).some((record) => record.translationKey === "labs")).toBe(true);
    await editorial.deleteCategories(["labs"]);
    expect((await editorial.listCategories("it")).some((category) => category.slug === "laboratori")).toBe(false);
  });
});

describe("entities", () => {
  const company = { kind: "company" as const, slug: "acme", name: "Acme AI", officialUrl: "https://acme.example", parentSlug: null, descriptions: { en: "An AI company.", it: "Un'azienda." } };
  const product = { kind: "product" as const, slug: "acme-chat", name: "Acme Chat", officialUrl: null, parentSlug: "acme", descriptions: {} };

  it("writes a company and its product in one batch, parent first, and reads them back", async () => {
    const editorial = repository();
    const [createdCompany, createdProduct] = await editorial.createEntities([company, product]);
    expect(createdCompany).toMatchObject({ slug: "acme", parent: null, descriptions: { en: "An AI company.", it: "Un'azienda." } });
    expect(createdProduct).toMatchObject({ slug: "acme-chat", parent: { slug: "acme", name: "Acme AI" }, descriptions: {} });
    expect(await editorial.findEntityBySlug("acme", "it")).toMatchObject({ description: "Un'azienda.", officialUrl: "https://acme.example" });
    expect((await editorial.listEntities("en", "product")).every((entity) => entity.kind === "product")).toBe(true);
  });

  it("writes a batch all or nothing and refuses an unknown or non-company parent", async () => {
    const editorial = repository();
    const before = await editorial.listEntityRecords();
    await expect(editorial.createEntities([company, { ...product, slug: "openai", parentSlug: "acme" }])).rejects.toThrow(/Unable to create entities/);
    await expect(editorial.createEntities([{ ...product, parentSlug: "ghost" }])).rejects.toThrow("Item 1: Unknown parent entity ghost");
    await expect(editorial.createEntities([{ ...product, parentSlug: "claude" }])).rejects.toThrow(/must be a company/);
    await expect(editorial.updateEntities([{ ...company, slug: "ghost" }])).rejects.toThrow('Item 1: Entity "ghost" not found');
    expect(await editorial.listEntityRecords()).toEqual(before);
  });

  it("updates with full values: a locale left out loses its description, a null parent clears it", async () => {
    const editorial = repository();
    await editorial.createEntities([company, product]);
    const [updatedCompany, updatedProduct] = await editorial.updateEntities([
      { ...company, name: "Acme Intelligence", descriptions: { en: "Renamed." } },
      { ...product, parentSlug: null },
    ]);
    expect(updatedCompany).toMatchObject({ name: "Acme Intelligence", descriptions: { en: "Renamed." } });
    expect(updatedProduct.parent).toBeNull();
    await expect(editorial.updateEntities([{ ...company, kind: "model" as const, parentSlug: null, slug: "anthropic" }])).rejects.toThrow(/stays a company/);
  });

  it("deletes in order, children before their company, and refuses a linked or parent entity", async () => {
    const editorial = repository();
    await editorial.deleteEntities(["claude", "anthropic"]);
    expect(await editorial.findEntityBySlug("anthropic", "en")).toBeNull();

    await editorial.save(story("A story that links ChatGPT", { entities: [{ slug: "chatgpt" }] }));
    await expect(editorial.deleteEntities(["chatgpt"])).rejects.toThrow('Item 1: Entity "chatgpt" is linked to 1 stories');
    await expect(editorial.deleteEntities(["openai"])).rejects.toThrow('Item 1: Entity "openai" is the parent of 1 entities');
    await expect(editorial.deleteEntities(["gemini", "gemini"])).rejects.toThrow('Item 2: Entity "gemini" not found');
    expect(await editorial.findEntityBySlug("gemini", "en")).not.toBeNull();
    expect((await editorial.countEntityStories(["chatgpt", "openai", "ghost"]))).toEqual(new Map([["chatgpt", 1], ["openai", 0], ["ghost", 0]]));
  });

  it("counts published stories of the locale only, and shows an unpublished link to editors only", async () => {
    const editorial = repository();
    const anonymous = repository({ audience: "public" });
    const draft = await editorial.save(story("A draft about Gemini", { entities: [{ slug: "gemini" }] }));
    const countOf = async (client: AdminEditorialRepository) => (await client.listEntities("en")).find((entity) => entity.slug === "gemini")?.storyCount;
    expect(await countOf(editorial)).toBe(0);
    expect((await editorial.countEntityStories(["gemini"])).get("gemini")).toBe(1);
    expect((await anonymous.countEntityStories(["gemini"])).get("gemini")).toBe(0);
    await editorial.setPublished([draft.id], true);
    expect(await countOf(anonymous)).toBe(1);
    expect(await anonymous.listEntityTimeline("gemini", "en")).toHaveLength(1);
    expect(await anonymous.listEntityTimeline("gemini", "it")).toEqual([]);
  });
});

describe("distribution", () => {
  it("keeps a published channel when the channels change, and adds the new ones as ready", async () => {
    const editorial = repository();
    const created = await editorial.save(story("A story with two channels", { distribution: ["x", "linkedin"] }));
    const [first] = (await editorial.listPublications("en")).filter((item) => item.articleId === created.id && item.channel === "x");
    await editorial.updatePublication({ id: first.id, status: "published" });

    await editorial.setDistributionChannels(created.id, ["whatsapp"]);
    const channels = (await editorial.listPublications("en"))
      .filter((item) => item.articleId === created.id)
      .map((item) => [item.channel, item.status]);
    expect(channels).toHaveLength(2);
    expect(channels).toEqual(expect.arrayContaining([["x", "published"], ["whatsapp", "ready"]]));
  });

  it("updates a publication the way update_distribution_publication does", async () => {
    const editorial = repository();
    const created = await editorial.save(story("A story to distribute", { distribution: ["x"] }));
    const [publication] = (await editorial.listPublications("en")).filter((item) => item.articleId === created.id);

    const published = await editorial.updatePublication({
      id: publication.id,
      status: "published",
      message: "  Out now  ",
      externalUrl: "https://example.com/post",
      scheduledFor: "2030-01-01T12:00:00+01:00",
    });
    expect(published).toMatchObject({
      status: "published",
      message: "Out now",
      externalUrl: "https://example.com/post",
      scheduledFor: "2030-01-01T11:00:00.000Z",
      articleTitle: "A story to distribute",
    });
    expect(published.publishedAt).toBeTruthy();

    const again = await editorial.updatePublication({ id: publication.id, status: "published", message: "" });
    expect(again).toMatchObject({ publishedAt: published.publishedAt, message: "", externalUrl: null, scheduledFor: null });
    const failed = await editorial.updatePublication({ id: publication.id, status: "failed" });
    expect(failed.publishedAt).toBeNull();

    await expect(editorial.updatePublication({ id: crypto.randomUUID(), status: "ready" })).rejects.toThrow("Distribution publication not found");
    await expect(editorial.updatePublication({ id: publication.id, status: "sent" as never })).rejects.toThrow("Invalid distribution status");
  });
});

describe("media", () => {
  it("stores an upload in R2 under editorial-media and serves it from the site's own path", async () => {
    const editorial = repository();
    const asset = await editorial.uploadAsset({ name: "cover.png", mimeType: "image/png", bytes: png });
    expect(asset).toMatchObject({ name: "cover.png", mimeType: "image/png", size: png.byteLength });
    expect(asset.path).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(asset.url).toBe(`/media-store/${asset.path}`);

    const stored = await store.media.get(`editorial-media/${asset.path}`);
    expect(stored?.httpMetadata?.contentType).toBe("image/png");
    expect(stored?.customMetadata?.originalName).toBe("cover.png");
    expect(await editorial.listAssets()).toEqual([expect.objectContaining({ path: asset.path, url: asset.url, name: "cover.png", mimeType: "image/png", size: png.byteLength })]);

    expect((await readSitesMediaObject(store.media, asset.path))?.key).toBe(`editorial-media/${asset.path}`);
    expect(await readSitesMediaObject(store.media, "missing.png")).toBeNull();
    expect(await readSitesMediaObject(store.media, "../editorial-media/cover.png")).toBeNull();
    expect(await readSitesMediaObject(store.media, "nested/cover.png")).toBeNull();
    await editorial.deleteAsset(asset.path);
  });

  it("lists the newest hundred assets only, and nothing that is not an upload", async () => {
    const editorial = repository();
    await store.media.put("elsewhere/other.png", png);
    await store.media.put("editorial-media/nested/other.png", png);
    for (let index = 0; index < 3; index += 1) await editorial.uploadAsset({ name: `${index}.png`, mimeType: "image/png", bytes: png });
    const assets = await editorial.listAssets();
    expect(assets).toHaveLength(3);
    expect(assets.map((asset) => asset.createdAt)).toEqual([...assets.map((asset) => asset.createdAt)].sort().reverse());
    await editorial.deleteAssets(assets.map((asset) => asset.path));
    expect(await editorial.listAssets()).toEqual([]);
  });

  it("reads one asset by its path, and nothing for a missing or nested path, a public audience or a missing bucket", async () => {
    const editorial = repository();
    const asset = await editorial.uploadAsset({ name: "cover.png", mimeType: "image/png", bytes: png });
    // R2 stamps the upload itself, a few milliseconds after the moment the repository reported.
    expect(await editorial.findAsset(asset.path)).toEqual({ ...asset, createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/) });
    expect(await editorial.findAsset("missing.png")).toBeNull();
    await store.media.put("editorial-media/nested/other.png", png);
    expect(await editorial.findAsset("nested/other.png")).toBeNull();
    expect(await editorial.findAsset("../editorial-media/other.png")).toBeNull();
    expect(await repository({ audience: "public" }).findAsset(asset.path)).toBeNull();
    expect(await repository({ media: null }).findAsset(asset.path)).toBeNull();
    await editorial.deleteAsset(asset.path);
    expect(await editorial.findAsset(asset.path)).toBeNull();
  });

  it("applies the limits of the Supabase bucket: image types and 8 MiB", async () => {
    const editorial = repository();
    await expect(editorial.uploadAsset({ name: "a.svg", mimeType: "image/svg+xml", bytes: png })).rejects.toThrow(/mime type is not supported/);
    await expect(editorial.uploadAsset({ name: "big.png", mimeType: "image/png", bytes: new Uint8Array(8_388_609) })).rejects.toThrow(/maximum allowed size/);
    expect(await editorial.listAssets()).toEqual([]);
  });

  it("knows which assets a cover image references, and refuses to delete one that is used", async () => {
    const editorial = repository();
    const asset = await editorial.uploadAsset({ name: "cover.png", mimeType: "image/png", bytes: png });
    expect(await editorial.isAssetReferenced(asset.path)).toBe(false);

    const [story1] = await editorial.listForStudio("en", { status: "published" });
    const cover = (value: string) => store.database.prepare("UPDATE articles SET cover_image = ? WHERE id = ?").bind(value, story1.id).run();
    for (const used of [asset.url, `${asset.url}?v=2#top`, asset.path, `https://example.com${asset.url}`]) {
      await cover(used);
      expect(await editorial.isAssetReferenced(asset.path)).toBe(true);
    }
    await cover(`/media-store/other-${asset.path}`);
    expect(await editorial.isAssetReferenced(asset.path)).toBe(false);

    await cover(asset.url);
    await expect(editorial.deleteAsset(asset.path)).rejects.toThrow("Unable to delete media assets");
    expect(await store.media.head(`editorial-media/${asset.path}`)).not.toBeNull();
    await cover("/media/atlas-hero.webp");
    await editorial.deleteAsset(asset.path);
    expect(await store.media.head(`editorial-media/${asset.path}`)).toBeNull();
    await expect(editorial.deleteAsset(asset.path)).rejects.toThrow("Unable to delete media assets");
    await expect(editorial.deleteAsset("../secret.png")).rejects.toThrow("Unable to delete media assets");
  });

  it("is not writable without a bucket, and the use cases say so plainly", async () => {
    const editorial = repository({ media: null });
    expect(editorial.writable).toBe(false);
    expect(repository().writable).toBe(true);
    expect(await editorial.listAssets()).toEqual([]);
    await expect(new MediaCommandService(editorial).uploadMany([{ name: "a.png", mimeType: "image/png", bytes: png }])).rejects.toThrow("Media uploads require media storage.");
    await expect(new MediaCommandService(editorial).deleteOne("a.png")).rejects.toThrow("Media deletion requires media storage.");
  });
});

describe("schema", () => {
  const insertArticle = (overrides: Record<string, unknown>) => {
    const record = {
      id: crypto.randomUUID(),
      translation_key: crypto.randomUUID(),
      locale: "en",
      slug: `story-${crypto.randomUUID()}`,
      title: "A story for the schema",
      excerpt: "A sufficiently descriptive summary of the story.",
      content: "A complete body for the story used in this test.",
      cover_alt: "A cover",
      category_id: "cat-tools-en",
      author_id: seedAuthor.id,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
    const columns = Object.keys(record);
    return store.database
      .prepare(`INSERT INTO articles (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
      .bind(...Object.values(record))
      .run();
  };

  it("rejects an article the Postgres constraints rejected", async () => {
    await insertArticle({});
    await expect(insertArticle({ slug: "Not A Slug" })).rejects.toThrow();
    await expect(insertArticle({ slug: "double--hyphen" })).rejects.toThrow();
    await expect(insertArticle({ status: "published" })).rejects.toThrow();
    await expect(insertArticle({ status: "scheduled" })).rejects.toThrow();
    await expect(insertArticle({ status: "archived" })).rejects.toThrow();
    await expect(insertArticle({ locale: "english" })).rejects.toThrow();
    await expect(insertArticle({ category_id: "cat-tools-it" })).rejects.toThrow();
    await expect(insertArticle({ author_id: "nobody" })).rejects.toThrow();
    await expect(insertArticle({ claim_status: "maybe" })).rejects.toThrow();
  });

  it("rejects key points and sources that are not valid", async () => {
    const source = { title: "A source", url: "https://example.com/post", supports: "The claim." };
    await insertArticle({ key_points: JSON.stringify(["Three", "Points", "Fine"]), sources: JSON.stringify([source]) });
    for (const keyPoints of [["ab"], ["One", "Two", "Three", "Four"], [1], "not json", {}]) {
      await expect(insertArticle({ key_points: typeof keyPoints === "string" ? keyPoints : JSON.stringify(keyPoints) })).rejects.toThrow();
    }
    for (const bad of [
      { ...source, url: "http://example.com" },
      { ...source, url: "https://exa mple.com" },
      { ...source, title: "ab" },
      { ...source, extra: "field" },
      { title: source.title, url: source.url },
    ]) {
      await expect(insertArticle({ sources: JSON.stringify([bad]) })).rejects.toThrow();
    }
    await expect(insertArticle({ sources: JSON.stringify(Array.from({ length: 11 }, () => source)) })).rejects.toThrow();
    await expect(store.database.prepare("UPDATE articles SET key_points = ? WHERE id = ?").bind('["ab"]', seedArticles[0].id).run()).rejects.toThrow();
  });

  it("keeps one primary entity per article, and a company as the only parent", async () => {
    const { database } = store;
    const link = (isPrimary: number, slug: string) => database
      .prepare("INSERT INTO article_entities (article_id, entity_id, is_primary) SELECT ?, id, ? FROM entities WHERE slug = ?")
      .bind(seedArticles[0].id, isPrimary, slug).run();
    await link(1, "claude");
    await link(0, "chatgpt");
    await expect(link(1, "gemini")).rejects.toThrow();
    await expect(database.prepare("DELETE FROM entities WHERE slug = 'claude'").run()).rejects.toThrow();

    const entity = (kind: string, slug: string, parent: string | null) => database
      .prepare("INSERT INTO entities (id, kind, slug, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, 'Name', (SELECT id FROM entities WHERE slug = ?), 'x', 'x')")
      .bind(crypto.randomUUID(), kind, slug, parent).run();
    await expect(entity("company", "acme", "anthropic")).rejects.toThrow();
    await expect(entity("model", "model-of-product", "claude")).rejects.toThrow(/must be a company/);
    await expect(entity("model", "Bad Slug", null)).rejects.toThrow();
    await entity("model", "model-of-anthropic", "anthropic");
  });
});
