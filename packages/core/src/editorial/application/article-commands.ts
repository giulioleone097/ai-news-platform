import type {
  Article,
  ArticleCreate,
  ArticleDraftInput,
  ArticlePatch,
} from "../domain/article";
import {
  articleLimits,
  articleStatuses,
  articleToDraft,
  draftStatuses,
  normalizeStoryFields,
  slugify,
  slugPattern,
  socialChannels,
} from "../domain/article";
import type { ArticleRepository } from "../domain/article-repository";
import type { EntityRepository } from "../domain/entity";
import {
  assertBatchSize,
  batchLimit,
  EditorialRuleError,
  findRepeats,
  rejectRepeats,
  validateEach,
} from "../domain/errors";
import { locales, type Locale } from "../../locale";

export function assertArticleDraft(input: ArticleDraftInput) {
  const { title, excerpt, content, coverAlt } = articleLimits;
  const inRange = (value: string, { min, max }: { min: number; max: number }) => {
    const length = value.trim().length;
    return length >= min && length <= max;
  };
  if (!inRange(input.title, title)) throw new EditorialRuleError("Invalid article title", "article.invalidTitle", title);
  if (!inRange(input.excerpt, excerpt)) throw new EditorialRuleError("Invalid article excerpt", "article.invalidExcerpt", excerpt);
  if (!inRange(input.content, content)) throw new EditorialRuleError("Invalid article content", "article.invalidContent", content);
  if (input.slug && !slugPattern.test(input.slug)) throw new EditorialRuleError("Invalid article slug", "article.invalidSlug");
  if (!slugPattern.test(input.categorySlug)) throw new EditorialRuleError("Invalid article category", "article.invalidCategory");
  if (!articleStatuses.includes(input.status)) throw new EditorialRuleError("Invalid article status", "article.invalidStatus");
  if (input.status === "scheduled" && (!input.scheduledFor || Number.isNaN(Date.parse(input.scheduledFor)))) {
    throw new EditorialRuleError("Scheduled articles require a valid date", "article.scheduleRequired");
  }
  if (input.coverAlt && !inRange(input.coverAlt, coverAlt)) {
    throw new EditorialRuleError("Invalid article cover description", "article.invalidCoverAlt", coverAlt);
  }
  if (input.distribution?.some((channel) => !socialChannels.includes(channel))) {
    throw new EditorialRuleError("Invalid distribution channel", "article.invalidChannel");
  }
  normalizeStoryFields(input);
}

const cannotPublish = "Saving cannot publish an article. Use the publish tool, which asks for confirmation.";
const cannotUnpublish = "Saving cannot take an article off the site. Use the unpublish tool, which asks for confirmation.";

/** A new article: draft unless said otherwise, and never published. */
export function prepareCreate(input: Omit<ArticleCreate, "translationOf">): ArticleDraftInput {
  const draft: ArticleDraftInput = { ...input, status: input.status ?? "draft" };
  if (!(draftStatuses as readonly string[]).includes(draft.status)) {
    throw new EditorialRuleError(cannotPublish, "article.cannotPublish");
  }
  assertArticleDraft(draft);
  return draft;
}

/**
 * The stored article with the given fields replaced; an omitted (or `undefined`) field keeps its
 * stored value. The publication state never changes here: a published article stays published
 * and nothing becomes published. `translationKey` is the already resolved link to the other language
 * (see `ArticleCommandService.translationKeyFor`).
 */
export function preparePatch(
  current: Article,
  changes: Omit<ArticlePatch, "translationOf">,
  translationKey?: string,
): ArticleDraftInput {
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as typeof changes;
  if (!Object.keys(given).length && translationKey === undefined) {
    throw new EditorialRuleError("Nothing to change: pass at least one field.", "change.nothing");
  }
  // The type forbids it; JSON from a tool or a script does not.
  if ((given.status as string | undefined) === "published") throw new EditorialRuleError(cannotPublish, "article.cannotPublish");
  if (given.status !== undefined && current.status === "published") {
    throw new EditorialRuleError(cannotUnpublish, "article.cannotUnpublish");
  }
  const draft: ArticleDraftInput = {
    ...articleToDraft(current),
    ...given,
    ...(translationKey === undefined ? {} : { translationKey }),
  };
  assertArticleDraft(draft);
  return draft;
}

export interface ArticleRef {
  id: string;
  locale: Locale;
}

export interface ArticlePatchItem extends ArticleRef {
  changes: ArticlePatch;
}

const repeatedSlug = (key: string) => `Slug "${key}" repeats in this batch`;
const repeatedTranslation = (key: string) => `The translation link "${key}" repeats in this batch`;
const draftKey = (draft: ArticleDraftInput) => `${draft.locale}/${slugify(draft.slug || draft.title)}`;

/** The language an article is translated into or from: the one that is not its own. */
const counterpart = (locale: Locale) => locales.find((candidate) => candidate !== locale) ?? locale;

/**
 * The article use cases. `create` and `patch` can never publish or unpublish: only `publish` and
 * `unpublish` change what the public sees. `save` is the exception: it keeps whatever status the draft
 * carries, published included. The capabilities never call it, and neither does the Studio form, which
 * runs the create, update, publish and unpublish capabilities like any other caller.
 *
 * `translationOf` (on `create` and `patch`) links a story to its translation by the slug of the article
 * in the other language: agents and editors know slugs, not translation keys.
 *
 * `create`, `patch` and the `*Many` methods check the category, the slug and the entity links first, so a
 * missing one is a rule error the caller can read and not a failure of the store. The `*Many` methods are
 * all-or-nothing: they check every item (references, slugs, state), report every invalid item by index,
 * and write nothing unless all are valid.
 */
export class ArticleCommandService {
  constructor(
    private readonly repository: ArticleRepository,
    private readonly entities: Pick<EntityRepository, "findEntityBySlug">,
  ) {}

  /** Saves the draft with whatever status it carries, published included. */
  async save(input: ArticleDraftInput) {
    assertArticleDraft(input);
    return this.repository.save(input);
  }

  async create(input: ArticleCreate) {
    const draft = await this.planCreate(input);
    await this.checkReferences(draft);
    return this.repository.save(draft);
  }

  async patch(current: Article, changes: ArticlePatch) {
    const draft = await this.planPatch(current, changes);
    await this.checkReferences(draft);
    return this.repository.save(draft);
  }

  async publish(article: Article) {
    const [published] = await this.repository.setPublished([article.id], true);
    return published;
  }

  async unpublish(article: Article) {
    const [unpublished] = await this.repository.setPublished([article.id], false);
    return unpublished;
  }

  async delete(id: string) {
    return this.repository.delete(id);
  }

  async createMany(inputs: ArticleCreate[]) {
    assertBatchSize(inputs.length, batchLimit, "article");
    const drafts = await validateEach(
      inputs,
      async (input) => {
        const draft = await this.planCreate(input);
        await this.checkReferences(draft);
        return draft;
      },
      (input) => input.slug ?? slugify(input.title),
      [
        ...findRepeats(inputs, (input) => `${input.locale}/${slugify(input.slug || input.title)}`, repeatedSlug),
        ...findRepeats(inputs, (input) => (input.translationOf ? `${input.locale}/${input.translationOf}` : undefined), repeatedTranslation),
      ],
    );
    return this.repository.saveMany(drafts);
  }

  /** Returns each saved article with the slug it had before, so callers can refresh both addresses. */
  async patchMany(items: ArticlePatchItem[]) {
    assertBatchSize(items.length, batchLimit, "article");
    rejectRepeats(items, ({ id, locale }) => `${locale}/${id}`, () => "The same article appears twice");
    const planned = await validateEach(
      items,
      async ({ id, locale, changes }) => {
        const current = await this.repository.findById(id, locale);
        if (!current) throw new EditorialRuleError(`Article ${id} not found in ${locale}.`, "article.notFound");
        const draft = await this.planPatch(current, changes);
        await this.checkReferences(draft);
        return { previousSlug: current.slug, draft };
      },
      ({ id }) => id,
      findRepeats(items, ({ locale, changes }) => (changes.translationOf ? `${locale}/${changes.translationOf}` : undefined), repeatedTranslation),
    );
    rejectRepeats(planned, ({ draft }) => draftKey(draft), repeatedSlug);
    const saved = await this.repository.saveMany(planned.map(({ draft }) => draft));
    return saved.map((article, index) => ({ article, previousSlug: planned[index].previousSlug }));
  }

  async publishMany(items: ArticleRef[]) {
    return this.setPublishedMany(items, true);
  }

  async unpublishMany(items: ArticleRef[]) {
    return this.setPublishedMany(items, false);
  }

  /** Returns the deleted articles, as they were, so callers can refresh what showed them. */
  async deleteMany(items: ArticleRef[]) {
    const articles = await this.findAll(items);
    await this.repository.deleteMany(articles.map((article) => article.id));
    return articles;
  }

  private async setPublishedMany(items: ArticleRef[], published: boolean) {
    const articles = await this.findAll(items);
    return this.repository.setPublished(articles.map((article) => article.id), published);
  }

  private async findAll(items: ArticleRef[]) {
    assertBatchSize(items.length, batchLimit, "article");
    rejectRepeats(items, ({ id, locale }) => `${locale}/${id}`, () => "The same article appears twice");
    return validateEach(
      items,
      async ({ id, locale }) => {
        const article = await this.repository.findById(id, locale);
        if (!article) throw new EditorialRuleError(`Article ${id} not found in ${locale}.`, "article.notFound");
        return article;
      },
      ({ id }) => id,
    );
  }

  private async planCreate({ translationOf, ...input }: ArticleCreate) {
    const draft = prepareCreate(input);
    const translationKey = translationOf ? await this.translationKeyFor(draft.locale, undefined, translationOf) : undefined;
    return translationKey ? { ...draft, translationKey } : draft;
  }

  private async planPatch(current: Article, { translationOf, ...changes }: ArticlePatch) {
    const translationKey = translationOf === undefined
      ? undefined
      : await this.translationKeyFor(current.locale, current, translationOf);
    return preparePatch(current, changes, translationKey);
  }

  /**
   * The translation key that makes an article the translation of the one with slug `of` in the other
   * language, or `undefined` when there is nothing to change. `null` unlinks a story: it gets a key of
   * its own, but only when another article still shares its key. A story has one translation per
   * language, so a link to an article that already has one is refused.
   */
  private async translationKeyFor(locale: Locale, current: Article | undefined, of: string | null) {
    const other = counterpart(locale);

    if (of === null) {
      const partner = current && await this.repository.findByTranslationKey(current.translationKey, other);
      return partner ? crypto.randomUUID() : undefined;
    }

    const target = await this.repository.findBySlug(of, other);
    if (!target) {
      if (await this.repository.findBySlug(of, locale)) {
        throw new EditorialRuleError(
          `"${of}" is a ${locale} article. translationOf names the article in the other language (${other}).`,
          "article.translationSameLocale",
          { slug: of, locale },
        );
      }
      throw new EditorialRuleError(`There is no ${other} article with the slug "${of}".`, "article.translationNotFound", { slug: of, locale: other });
    }
    if (current && target.translationKey === current.translationKey) return undefined;

    const holder = await this.repository.findByTranslationKey(target.translationKey, locale);
    if (holder && holder.id !== current?.id) {
      throw new EditorialRuleError(
        `The ${other} article "${of}" already has a ${locale} translation: "${holder.slug}".`,
        "article.translationTaken",
        { slug: of, locale, other: holder.slug },
      );
    }
    return target.translationKey;
  }

  /** The category, the entity links and the slug must be usable, so the write cannot fail on them halfway. */
  private async checkReferences(draft: ArticleDraftInput) {
    const [categories, taken] = await Promise.all([
      this.repository.listCategories(draft.locale),
      this.repository.findBySlug(slugify(draft.slug || draft.title), draft.locale),
    ]);
    if (!categories.some((category) => category.slug === draft.categorySlug)) {
      throw new EditorialRuleError(
        `There is no ${draft.locale} category with the slug "${draft.categorySlug}".`,
        "article.unknownCategory",
        { slug: draft.categorySlug, locale: draft.locale },
      );
    }
    if (taken && taken.id !== draft.id) {
      throw new EditorialRuleError(
        `The slug "${taken.slug}" is already used by another ${draft.locale} article.`,
        "article.slugTaken",
        { slug: taken.slug, locale: draft.locale },
      );
    }
    for (const link of draft.entities ?? []) {
      if (!(await this.entities.findEntityBySlug(link.slug, draft.locale))) {
        throw new EditorialRuleError(`Unknown entity "${link.slug}".`, "article.unknownEntity", { slug: link.slug });
      }
    }
  }
}
