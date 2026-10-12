import { afterAll, describe, expect, it } from "vitest";
import { ArticleCommandService } from "@atlasnews/core/editorial/application/article-commands";
import type { ArticleCreate } from "@atlasnews/core/editorial/domain/article";
import { EditorialRuleError } from "@atlasnews/core/editorial/domain/errors";
import { seedArticles } from "./seed";
import { createEditorialBackends } from "./testing";

// Linking an English and an Italian article runs against the in-memory repository and against D1.
const backends = createEditorialBackends();

const base = {
  excerpt: "A sufficiently descriptive summary of the story.",
  content: "A complete body for the story used in this test.",
} as const;

function english(title: string, rest: Partial<ArticleCreate> = {}): ArticleCreate {
  return { ...base, locale: "en", title, categorySlug: "tools", ...rest };
}

function italian(title: string, rest: Partial<ArticleCreate> = {}): ArticleCreate {
  return { ...base, locale: "it", title, categorySlug: "strumenti", ...rest };
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(EditorialRuleError);
  return error as EditorialRuleError;
}

describe.each(backends)("article translations in the $name repository", (backend) => {
  afterAll(() => backend.dispose());

  async function setup() {
    const repository = await backend.create();
    return { repository, service: new ArticleCommandService(repository, repository) };
  }

  it("links a new article to the article in the other language by its slug", async () => {
    const { repository, service } = await setup();
    const source = await service.create(english("A story written in English first"));
    const translated = await service.create(italian("Una storia scritta dopo in italiano", { translationOf: source.slug }));

    expect(translated.translationKey).toBe(source.translationKey);
    expect(await repository.findByTranslationKey(source.translationKey, "it")).toMatchObject({ id: translated.id });
    expect(await repository.findByTranslationKey(source.translationKey, "en")).toMatchObject({ id: source.id });
  });

  it("gives an article that names no translation a key of its own", async () => {
    const { service } = await setup();
    const first = await service.create(english("A story that stands alone one"));
    const second = await service.create(english("A story that stands alone two"));

    expect(first.translationKey).not.toBe(second.translationKey);
  });

  it("links an existing article, moves the link to another article, and unlinks it", async () => {
    const { repository, service } = await setup();
    const first = await service.create(english("The first English story to link"));
    const second = await service.create(english("The second English story to link"));
    const translated = await service.create(italian("Una storia italiana da collegare"));
    expect(translated.translationKey).not.toBe(first.translationKey);

    const linked = await service.patch(translated, { translationOf: first.slug });
    expect(linked.translationKey).toBe(first.translationKey);
    expect(linked.title).toBe(translated.title);

    const moved = await service.patch(linked, { translationOf: second.slug });
    expect(moved.translationKey).toBe(second.translationKey);
    expect(await repository.findByTranslationKey(first.translationKey, "it")).toBeNull();

    const unlinked = await service.patch(moved, { translationOf: null });
    expect(unlinked.translationKey).not.toBe(second.translationKey);
    expect(await repository.findByTranslationKey(second.translationKey, "it")).toBeNull();
    expect(await repository.findByTranslationKey(second.translationKey, "en")).toMatchObject({ id: second.id });

    // Unlinking a story that has no translation changes nothing, so it is not a change to ask for.
    expect((await refusal(service.patch(unlinked, { translationOf: null }))).code).toBe("change.nothing");
  });

  it("keeps the link when the article is patched without naming it", async () => {
    const { service } = await setup();
    const source = await service.create(english("A story whose link must survive edits"));
    const translated = await service.create(italian("Una storia il cui collegamento resta", { translationOf: source.slug }));

    const edited = await service.patch(translated, { title: "Una storia il cui collegamento resta, rivista" });
    expect(edited.translationKey).toBe(source.translationKey);
  });

  it("refuses a slug that names no article in the other language, with a code and the values", async () => {
    const { service } = await setup();
    const missing = await refusal(service.create(italian("Una storia senza originale", { translationOf: "no-such-story" })));
    expect(missing).toMatchObject({ code: "article.translationNotFound", params: { slug: "no-such-story", locale: "en" } });
    expect(missing.message).toContain('no en article with the slug "no-such-story"');
  });

  it("refuses the slug of an article in the same language", async () => {
    const { service } = await setup();
    const source = await service.create(english("An English story that is not a translation"));
    const same = await refusal(service.create(english("Another English story for the same", { translationOf: source.slug })));
    expect(same).toMatchObject({ code: "article.translationSameLocale", params: { slug: source.slug, locale: "en" } });
  });

  it("refuses to link a story that already has a translation in this language", async () => {
    const { service } = await setup();
    const [seeded] = seedArticles.filter((article) => article.locale === "en");
    const taken = await refusal(service.create(italian("Una seconda traduzione non ammessa", { translationOf: seeded!.slug })));
    expect(taken.code).toBe("article.translationTaken");
    expect(taken.params).toMatchObject({ slug: seeded!.slug, locale: "it" });
  });

  it("checks every link of a batch before it writes anything", async () => {
    const { repository, service } = await setup();
    const source = await service.create(english("A story for a batch of links"));

    const rejected = await refusal(service.createMany([
      italian("Una traduzione valida nel gruppo", { translationOf: source.slug }),
      italian("Una traduzione ripetuta nel gruppo", { translationOf: source.slug }),
    ]));
    expect(rejected.code).toBe("batch.rejected");
    expect(await repository.findByTranslationKey(source.translationKey, "it")).toBeNull();
  });
});
