import { afterAll, describe, expect, it, vi } from "vitest";

import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";
import { CategoryCommandService } from "@atlasnews/core/editorial/application/category-commands";
import { EntityCommandService } from "@atlasnews/core/editorial/application/entity-commands";
import { MediaCommandService } from "@atlasnews/core/editorial/application/media-commands";
import type { ArticleCreate } from "@atlasnews/core/editorial/domain/article";
import type { MediaRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { BatchValidationError, EditorialRuleError } from "@atlasnews/core/editorial/domain/errors";

import { MemoryEditorialRepository } from "./memory-editorial-repository";
import { createEditorialBackends, type EditorialBackend } from "./testing";

// The article, category and entity cases run against the in-memory repository and against D1.
const backends = createEditorialBackends();

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function story(title: string, rest: Partial<ArticleCreate> = {}): ArticleCreate {
  return {
    locale: "en",
    title,
    excerpt: "A sufficiently descriptive summary of the story.",
    content: "A complete body for the story used in this test.",
    categorySlug: "tools",
    ...rest,
  };
}

async function setup(backend: EditorialBackend) {
  const repository = await backend.create();
  return { repository, articles: new ArticleCommandService(repository, repository) };
}

async function issues(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(BatchValidationError);
  return (error as BatchValidationError).issues.map(({ index, message }) => ({ index, message }));
}

describe.each(backends)("$name repository", (backend) => {
  afterAll(() => backend.dispose());

  describe("articles: create, read, list", () => {
    it("creates a draft by default, reads it back and lists it by filter", async () => {
      const { repository, articles } = await setup(backend);
      const created = await articles.create(story("A fresh draft for the editor"));
      expect(created.status).toBe("draft");
      expect(await repository.findById(created.id, "en")).toMatchObject({ title: "A fresh draft for the editor" });

      const drafts = await repository.listForStudio("en", { status: "draft" });
      expect(drafts.map((item) => item.id)).toContain(created.id);
      expect((await repository.listForStudio("en", { status: "draft", query: "fresh draft" })).map((item) => item.id)).toEqual([created.id]);
      expect(await repository.listForStudio("en", { category: "policy", status: "draft" })).toEqual([]);
      expect((await repository.listForStudio("en", { status: "published" })).every((item) => item.status === "published")).toBe(true);
    });
  });

  describe("articles: the publish bypass is closed", () => {
    it("never publishes on create, patch or their batches, and never unpublishes either", async () => {
      const { repository, articles } = await setup(backend);
      const published = (await repository.listForStudio("en", { status: "published" }))[0];
      const draft = await articles.create(story("A draft that must stay a draft"));

      await expect(articles.create(story("Created straight as published", { status: "published" as never })))
        .rejects.toThrow(/cannot publish/);
      await expect(articles.patch(draft, { status: "published" as never })).rejects.toThrow(/cannot publish/);
      await expect(articles.patch(published, { status: "draft" })).rejects.toThrow(/cannot take an article off the site/);

      expect(await issues(articles.createMany([story("Fine draft number one"), story("Sneaky published one", { status: "published" as never })])))
        .toEqual([{ index: 1, message: expect.stringContaining("cannot publish") }]);
      expect(await issues(articles.patchMany([
        { id: draft.id, locale: "en", changes: { status: "published" as never } },
        { id: published.id, locale: "en", changes: { status: "review" } },
      ]))).toEqual([
        { index: 0, message: expect.stringContaining("cannot publish") },
        { index: 1, message: expect.stringContaining("cannot take an article off the site") },
      ]);

      expect((await repository.findById(draft.id, "en"))?.status).toBe("draft");
      expect((await repository.findById(published.id, "en"))?.status).toBe("published");
      expect((await repository.listForStudio("en")).some((item) => item.title === "Fine draft number one")).toBe(false);
    });

    it("lets a patch edit a published article while it stays published", async () => {
      const { repository, articles } = await setup(backend);
      const published = (await repository.listForStudio("en", { status: "published" }))[0];
      const patched = await articles.patch(published, { featured: !published.featured });
      expect(patched.status).toBe("published");
      expect(patched.publishedAt).toBe(published.publishedAt);
    });

    it("changes publication only through publish and unpublish, singly or in a batch", async () => {
      const { repository, articles } = await setup(backend);
      const [first, second] = await articles.createMany([story("First story to go live"), story("Second story to go live")]);

      const live = await articles.publishMany([{ id: first.id, locale: "en" }, { id: second.id, locale: "en" }]);
      expect(live.map((item) => item.status)).toEqual(["published", "published"]);
      expect(live[0].publishedAt).toBeTruthy();

      const down = await articles.unpublishMany([{ id: first.id, locale: "en" }]);
      expect(down[0]).toMatchObject({ status: "draft", publishedAt: live[0].publishedAt });
      expect((await repository.listPublished({ locale: "en", limit: 50 })).items.some((item) => item.id === first.id)).toBe(false);

      const again = await articles.publish(down[0]);
      expect(again).toMatchObject({ status: "published", publishedAt: live[0].publishedAt });
      expect((await articles.unpublish(again)).status).toBe("draft");
    });
  });

  describe("articles: PATCH semantics", () => {
    it("keeps omitted fields, replaces given ones and clears only what the domain allows", async () => {
      const { articles } = await setup(backend);
      const created = await articles.create(story("A story to patch step by step", {
        status: "scheduled",
        scheduledFor: "2030-01-01T10:00:00.000Z",
        featured: true,
        distribution: ["x", "linkedin"],
        claimStatus: "rumour",
        keyPoints: ["First point", "Second point", "Third point"],
        sources: [{ title: "A forum post", url: "https://example.com/post", supports: "The claim." }],
        entities: [{ slug: "openai", isPrimary: true }],
      }));

      const renamed = await articles.patch(created, { title: "A story patched one step later" });
      expect(renamed).toMatchObject({
        title: "A story patched one step later",
        slug: created.slug,
        status: "scheduled",
        scheduledFor: created.scheduledFor,
        featured: true,
        distribution: expect.arrayContaining(["x", "linkedin"]),
        claimStatus: "rumour",
        keyPoints: created.keyPoints,
        sources: created.sources,
        entities: [expect.objectContaining({ slug: "openai" })],
      });

      // `undefined` is "omitted", not "clear".
      const same = await articles.patch(renamed, { excerpt: undefined, featured: false });
      expect(same).toMatchObject({ excerpt: created.excerpt, featured: false });

      const cleared = await articles.patch(same, { status: "draft", scheduledFor: null, keyPoints: [], sources: [], entities: [], distribution: [] });
      expect(cleared).toMatchObject({ status: "draft", scheduledFor: null, keyPoints: [], sources: [], entities: [], distribution: [] });
      expect(cleared.title).toBe("A story patched one step later");

      await expect(articles.patch(cleared, {})).rejects.toThrow(/Nothing to change/);
      await expect(articles.patch(cleared, { status: "scheduled", scheduledFor: null })).rejects.toThrow(/valid date/);
    });

    it("patches many at once and returns the previous slug of each", async () => {
      const { repository, articles } = await setup(backend);
      const [first, second] = await articles.createMany([story("First story of the batch"), story("Second story of the batch")]);
      const saved = await articles.patchMany([
        { id: first.id, locale: "en", changes: { slug: "first-renamed" } },
        { id: second.id, locale: "en", changes: { featured: true } },
      ]);
      expect(saved.map(({ article, previousSlug }) => [article.slug, previousSlug])).toEqual([
        ["first-renamed", first.slug],
        [second.slug, second.slug],
      ]);
      expect((await repository.findById(second.id, "en"))?.featured).toBe(true);
    });
  });

  describe("articles: delete", () => {
    it("deletes one, and many by their references", async () => {
      const { repository, articles } = await setup(backend);
      const [first, second, third] = await articles.createMany([story("Story to delete one"), story("Story to delete two"), story("Story to delete three")]);
      await articles.delete(first.id);
      const gone = await articles.deleteMany([{ id: second.id, locale: "en" }, { id: third.id, locale: "en" }]);
      expect(gone.map((item) => item.slug)).toEqual([second.slug, third.slug]);
      expect(await repository.findById(second.id, "en")).toBeNull();
    });
  });

  describe("articles: batches are all or nothing", () => {
    it("reports every invalid item by index and writes nothing", async () => {
      const { repository, articles } = await setup(backend);
      const before = (await repository.listForStudio("en")).length;
      const found = await issues(articles.createMany([
        story("A perfectly valid story one"),
        story("A story in an unknown category", { categorySlug: "nowhere" }),
        story("A perfectly valid story two"),
        story("Short"),
        story("A story linking a ghost entity", { entities: [{ slug: "no-such-entity" }] }),
        story("A perfectly valid story one"),
      ]));
      expect(found.map((item) => item.index)).toEqual([1, 3, 4, 5]);
      expect(found[0].message).toContain("Unknown category");
      expect(found[1].message).toBe("Invalid article title");
      expect(found[2].message).toContain("Unknown entity");
      expect(found[3].message).toContain("repeats in this batch");
      expect((await repository.listForStudio("en")).length).toBe(before);
    });

    it("refuses a slug that another article already uses, and the same article twice", async () => {
      const { repository, articles } = await setup(backend);
      const [first] = await articles.createMany([story("A story that owns its slug")]);
      expect(await issues(articles.createMany([story("Another title", { slug: first.slug })])))
        .toEqual([{ index: 0, message: expect.stringContaining("already used") }]);
      expect(await issues(articles.deleteMany([{ id: first.id, locale: "en" }, { id: first.id, locale: "en" }])))
        .toEqual([{ index: 1, label: undefined, message: expect.stringContaining("appears twice") }].map(({ index, message }) => ({ index, message })));
      expect(await repository.findById(first.id, "en")).not.toBeNull();
    });

    it.runIf(backend.name === "memory")("leaves nothing behind when the write fails halfway", async () => {
      const { repository, articles } = await setup(backend);
      const before = (await repository.listForStudio("en")).length;
      const save = vi.spyOn(repository, "save");
      const real = MemoryEditorialRepository.prototype.save.bind(repository as MemoryEditorialRepository);
      let calls = 0;
      save.mockImplementation(async (input) => {
        calls += 1;
        if (calls === 3) throw new Error("database went away");
        return real(input);
      });
      await expect(articles.createMany([story("Batch story number one"), story("Batch story number two"), story("Batch story number three")]))
        .rejects.toThrow("database went away");
      expect(calls).toBe(3);
      expect((await repository.listForStudio("en")).length).toBe(before);
    });

    it("leaves everything in place when one item of a publish or delete batch does not exist", async () => {
      const { repository, articles } = await setup(backend);
      const [draft] = await articles.createMany([story("A draft that must survive")]);
      const missing = { id: "00000000-0000-4000-8000-000000000000", locale: "en" as const };
      expect(await issues(articles.publishMany([{ id: draft.id, locale: "en" }, missing]))).toEqual([{ index: 1, message: expect.stringContaining("not found") }]);
      expect(await issues(articles.deleteMany([{ id: draft.id, locale: "en" }, missing]))).toEqual([{ index: 1, message: expect.stringContaining("not found") }]);
      expect((await repository.findById(draft.id, "en"))?.status).toBe("draft");
    });

    it("caps a batch with the domain constant", async () => {
      const { articles } = await setup(backend);
      const many = Array.from({ length: 26 }, (_, index) => story(`Story number ${index} of a long batch`));
      await expect(articles.createMany(many)).rejects.toThrow(/at most 25 articles/);
      await expect(articles.createMany([])).rejects.toBeInstanceOf(EditorialRuleError);
    });
  });

  describe("categories", () => {
    const input = {
      translations: {
        en: { name: "Open source", description: "Open models and code." },
        it: { name: "Codice aperto" },
      },
    };

    it("creates both locales under one key, with the next position, and reads them back", async () => {
      const repository = await backend.create();
      const commands = new CategoryCommandService(repository);
      const record = await commands.createOne(input);
      expect(record).toMatchObject({
        translationKey: "open-source",
        position: 6,
        translations: {
          en: { slug: "open-source", name: "Open source", description: "Open models and code." },
          it: { slug: "codice-aperto", name: "Codice aperto", description: "" },
        },
      });
      expect((await repository.listCategories("it")).map((item) => item.slug)).toContain("codice-aperto");
      expect((await repository.listCategories("en")).at(-1)?.slug).toBe("open-source");
    });

    it("patches only what is given, clears a description with an empty text and keeps the key", async () => {
      const repository = await backend.create();
      const commands = new CategoryCommandService(repository);
      const created = await commands.createOne(input);

      const renamed = await commands.updateOne({ translationKey: "open-source", translations: { it: { name: "Open source IT" } } });
      expect(renamed.translations.it).toMatchObject({ name: "Open source IT", slug: "codice-aperto" });
      expect(renamed.translations.en).toEqual(created.translations.en);

      const cleared = await commands.updateOne({ translationKey: "open-source", position: 2, translations: { en: { description: "" } } });
      expect(cleared).toMatchObject({ translationKey: "open-source", position: 2 });
      expect(cleared.translations.en?.description).toBe("");
      expect(cleared.translations.en?.name).toBe("Open source");

      await expect(commands.updateOne({ translationKey: "open-source" })).rejects.toThrow(/Nothing to change/);
      await expect(commands.updateOne({ translationKey: "open-source", translations: { en: { slug: "research" } } }))
        .rejects.toThrow(/already used by category "research"/);
      await expect(commands.updateOne({ translationKey: "ghost", position: 1 })).rejects.toThrow(/not found/);
    });

    it("keeps the articles of a renamed category attached to it", async () => {
      const { repository, articles } = await setup(backend);
      const commands = new CategoryCommandService(repository);
      const story1 = await articles.create(story("A story in tools to rename"));
      await commands.updateOne({ translationKey: "tools", translations: { en: { slug: "toolbox", name: "Toolbox" } } });
      expect((await repository.findById(story1.id, "en"))?.category).toMatchObject({ slug: "toolbox", name: "Toolbox" });
    });

    it("refuses to delete a category that articles use, and deletes an unused one", async () => {
      const repository = await backend.create();
      const commands = new CategoryCommandService(repository);
      await expect(commands.deleteOne("research")).rejects.toThrow(/Category "research" is used by \d+ articles/);
      await commands.createOne(input);
      await expect(commands.deleteOne("open-source")).resolves.toBe("open-source");
      expect((await repository.listCategoryRecords()).some((record) => record.translationKey === "open-source")).toBe(false);
      expect((await repository.listCategories("it")).some((category) => category.slug === "codice-aperto")).toBe(false);
    });

    it("is all or nothing: every invalid item is reported and nothing is written", async () => {
      const repository = await backend.create();
      const commands = new CategoryCommandService(repository);
      const before = await repository.listCategoryRecords();
      const found = await issues(commands.createMany([
        input,
        { translations: { en: { name: "Policy again", slug: "policy" }, it: { name: "Altro" } } },
        { translations: { en: { name: "X" }, it: { name: "Y valido" } } },
        input,
      ]));
      expect(found.map((item) => item.index)).toEqual([1, 2, 3]);
      expect(await repository.listCategoryRecords()).toEqual(before);

      await commands.createOne(input);
      const withSpare = await repository.listCategoryRecords();
      expect(await issues(commands.deleteMany(["open-source", "research", "ghost"]))).toEqual([
        { index: 1, message: expect.stringContaining("is used by") },
        { index: 2, message: expect.stringContaining("not found") },
      ]);
      expect(await repository.listCategoryRecords()).toEqual(withSpare);
    });

    it.runIf(backend.name === "memory")("leaves nothing behind when the write fails halfway", async () => {
      const repository = await backend.create();
      const commands = new CategoryCommandService(repository);
      const before = await repository.listCategoryRecords();
      const write = vi.spyOn(repository as unknown as { writeCategory(item: unknown, create: boolean): void }, "writeCategory");
      const real = (repository as unknown as { writeCategory(item: unknown, create: boolean): void }).writeCategory.bind(repository);
      let calls = 0;
      write.mockImplementation((item, create) => {
        calls += 1;
        if (calls === 2) throw new Error("database went away");
        real(item, create);
      });
      await expect(commands.createMany([
        { translations: { en: { name: "Alpha topic" }, it: { name: "Alfa tema" } } },
        { translations: { en: { name: "Beta topic" }, it: { name: "Beta tema" } } },
      ])).rejects.toThrow("database went away");
      expect(await repository.listCategoryRecords()).toEqual(before);
    });
  });

  describe("entities", () => {
    it("creates a company and its product in one batch, with descriptions per locale", async () => {
      const repository = await backend.create();
      const commands = new EntityCommandService(repository);
      const created = await commands.createMany([
        { kind: "company", name: "Acme AI", officialUrl: "https://acme.example", descriptions: { en: "An AI company.", it: "Un'azienda di AI." } },
        { kind: "product", name: "Acme Chat", parentSlug: "acme-ai", descriptions: { en: "Its assistant." } },
      ]);
      expect(created.map((item) => item.slug)).toEqual(["acme-ai", "acme-chat"]);
      expect(created[1]).toMatchObject({ parent: { slug: "acme-ai", name: "Acme AI" }, descriptions: { en: "Its assistant." } });
      expect((await repository.findEntityBySlug("acme-chat", "it"))?.description).toBe("");
      expect((await repository.findEntityBySlug("acme-ai", "it"))?.description).toBe("Un'azienda di AI.");
    });

    it("patches only what is given and clears with null", async () => {
      const repository = await backend.create();
      const commands = new EntityCommandService(repository);
      await commands.createOne({ kind: "company", name: "Acme AI", officialUrl: "https://acme.example", descriptions: { en: "An AI company.", it: "Un'azienda." } });
      await commands.createOne({ kind: "product", name: "Acme Chat", parentSlug: "acme-ai", officialUrl: "https://chat.acme.example" });

      const renamed = await commands.updateOne({ slug: "acme-chat", name: "Acme Chat Pro" });
      expect(renamed).toMatchObject({ name: "Acme Chat Pro", slug: "acme-chat", officialUrl: "https://chat.acme.example", parent: { slug: "acme-ai" } });

      const cleared = await commands.updateOne({ slug: "acme-chat", officialUrl: null, parentSlug: null });
      expect(cleared).toMatchObject({ officialUrl: null, parent: null, name: "Acme Chat Pro" });

      const trimmed = await commands.updateOne({ slug: "acme-ai", descriptions: { it: null } });
      expect(trimmed.descriptions).toEqual({ en: "An AI company." });
      const added = await commands.updateOne({ slug: "acme-ai", descriptions: { it: "Nuova." } });
      expect(added.descriptions).toEqual({ en: "An AI company.", it: "Nuova." });

      await expect(commands.updateOne({ slug: "acme-ai" })).rejects.toThrow(/Nothing to change/);
      await expect(commands.updateOne({ slug: "nobody", name: "Nobody" })).rejects.toThrow(/not found/);
      await expect(commands.updateOne({ slug: "acme-chat", parentSlug: "acme-chat" })).rejects.toThrow(/must be a company/);
      await expect(commands.updateOne({ slug: "acme-ai", parentSlug: "openai" })).rejects.toThrow(/no parent/);
      await expect(commands.updateOne({ slug: "anthropic", kind: "model" })).rejects.toThrow(/stays a company/);
    });

    it("refuses to delete an entity that stories link or that is a company of others", async () => {
      const { repository, articles } = await setup(backend);
      const commands = new EntityCommandService(repository);
      await articles.create(story("A story that links OpenAI", { entities: [{ slug: "openai", isPrimary: true }] }));
      await expect(commands.deleteOne("openai")).rejects.toThrow(/Entity "openai" is linked to 1 story/);
      await expect(commands.deleteOne("anthropic")).rejects.toThrow(/Entity "anthropic" is the company of 1 other entity/);
      expect(await repository.findEntityBySlug("openai", "en")).not.toBeNull();
    });

    it("deletes a company together with its own entities, children first", async () => {
      const repository = await backend.create();
      const commands = new EntityCommandService(repository);
      await commands.deleteMany(["anthropic", "claude"]);
      expect(await repository.findEntityBySlug("anthropic", "en")).toBeNull();
      expect(await repository.findEntityBySlug("claude", "en")).toBeNull();
    });

    it("is all or nothing: every invalid item is reported and nothing is written", async () => {
      const repository = await backend.create();
      const commands = new EntityCommandService(repository);
      const before = await repository.listEntityRecords();
      const found = await issues(commands.createMany([
        { kind: "company", name: "Fine Company" },
        { kind: "product", name: "Orphan Product", parentSlug: "ghost-company" },
        { kind: "company", name: "OpenAI" },
        { kind: "company", name: "Has Parent", parentSlug: "openai" },
        { kind: "company", name: "Bad Url", officialUrl: "http://plain.example" },
      ]));
      expect(found.map((item) => item.index)).toEqual([1, 2, 3, 4]);
      expect(await repository.listEntityRecords()).toEqual(before);

      expect(await issues(commands.deleteMany(["claude", "anthropic", "ghost"]))).toEqual([{ index: 2, message: expect.stringContaining("not found") }]);
      expect(await repository.listEntityRecords()).toEqual(before);
    });

    it.runIf(backend.name === "memory")("leaves nothing behind when the write fails halfway", async () => {
      const repository = await backend.create();
      const commands = new EntityCommandService(repository);
      const before = await repository.listEntityRecords();
      const write = vi.spyOn(repository as unknown as { writeEntity(item: unknown, create: boolean): void }, "writeEntity");
      const real = (repository as unknown as { writeEntity(item: unknown, create: boolean): void }).writeEntity.bind(repository);
      let calls = 0;
      write.mockImplementation((item, create) => {
        calls += 1;
        if (calls === 2) throw new Error("database went away");
        real(item, create);
      });
      await expect(commands.createMany([{ kind: "company", name: "Alpha Co" }, { kind: "company", name: "Beta Co" }]))
        .rejects.toThrow("database went away");
      expect(await repository.listEntityRecords()).toEqual(before);
    });
  });
});

describe("media", () => {
  function fakeStorage(overrides: Partial<MediaRepository> = {}) {
    const stored = new Map<string, boolean>([["in-use.png", true], ["spare.png", false], ["other.png", false]]);
    const repository: MediaRepository = {
      writable: true,
      listAssets: async () => [...stored.keys()].map((path) => ({ path, url: `/${path}`, name: path, mimeType: "image/png", size: 1, createdAt: "" })),
      isAssetReferenced: async (path) => stored.get(path) ?? false,
      uploadAsset: vi.fn(async (input) => {
        const path = `${stored.size}-${input.name}`;
        stored.set(path, false);
        return { path, url: `/${path}`, name: input.name, mimeType: input.mimeType, size: input.bytes.length, createdAt: "" };
      }),
      deleteAsset: async (path) => void stored.delete(path),
      deleteAssets: vi.fn(async (paths: string[]) => void paths.forEach((path) => stored.delete(path))),
      ...overrides,
    };
    return { repository, stored, commands: new MediaCommandService(repository) };
  }

  it("uploads many images, refusing bytes that are not the declared type before storing any", async () => {
    const { commands, stored, repository } = fakeStorage();
    const before = stored.size;
    expect(await issues(commands.uploadMany([
      { name: "a.png", mimeType: "image/png", bytes: png },
      { name: "b.png", mimeType: "image/png", bytes: Uint8Array.from([1, 2, 3, 4]) },
    ]))).toEqual([{ index: 1, message: expect.stringContaining("do not match") }]);
    expect(repository.uploadAsset).not.toHaveBeenCalled();
    expect(stored.size).toBe(before);

    const assets = await commands.uploadMany([{ name: "a.png", mimeType: "image/png", bytes: png }, { name: "c.png", mimeType: "image/png", bytes: png }]);
    expect(assets).toHaveLength(2);
    expect(stored.size).toBe(before + 2);
  });

  it("removes what it had stored when an upload fails halfway", async () => {
    let calls = 0;
    const { commands, stored } = fakeStorage({
      uploadAsset: async (input) => {
        calls += 1;
        if (calls === 3) throw new Error("storage went away");
        const path = `new-${calls}-${input.name}`;
        stored.set(path, false);
        return { path, url: path, name: input.name, mimeType: input.mimeType, size: 1, createdAt: "" };
      },
    });
    const before = stored.size;
    const upload = { name: "x.png", mimeType: "image/png", bytes: png };
    await expect(commands.uploadMany([upload, upload, upload])).rejects.toThrow("storage went away");
    expect(stored.size).toBe(before);
  });

  it("refuses to delete an asset that an article uses, or that does not exist, and deletes nothing", async () => {
    const { commands, stored, repository } = fakeStorage();
    expect(await issues(commands.deleteMany(["spare.png", "in-use.png", "ghost.png"]))).toEqual([
      { index: 1, message: "Media asset is referenced by an article." },
      { index: 2, message: "Media asset not found." },
    ]);
    expect(repository.deleteAssets).not.toHaveBeenCalled();
    expect([...stored.keys()]).toContain("spare.png");
    await expect(commands.deleteOne("in-use.png")).rejects.toThrow("Media asset is referenced by an article.");

    await expect(commands.deleteMany(["spare.png", "other.png"])).resolves.toEqual(["spare.png", "other.png"]);
    expect([...stored.keys()]).toEqual(["in-use.png"]);
  });

  it("says plainly that the demo store is read only", async () => {
    const commands = new MediaCommandService(new MemoryEditorialRepository());
    await expect(commands.uploadMany([{ name: "a.png", mimeType: "image/png", bytes: png }])).rejects.toThrow("Media uploads require media storage.");
    await expect(commands.deleteOne("media/neura-agents-hero.webp")).rejects.toThrow("Media deletion requires media storage.");
  });
});
