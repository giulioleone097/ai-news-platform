import type {
  Article,
  ArticleCreate,
  ArticleDraftInput,
  ArticlePatch,
} from "../domain/article";
import {
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
import type { Locale } from "../../locale";

export function assertArticleDraft(input: ArticleDraftInput) {
  const titleLength = input.title.trim().length;
  const excerptLength = input.excerpt.trim().length;
  const contentLength = input.content.trim().length;
  if (titleLength < 8 || titleLength > 180) throw new EditorialRuleError("Invalid article title");
  if (excerptLength < 20 || excerptLength > 360) throw new EditorialRuleError("Invalid article excerpt");
  if (contentLength < 20 || contentLength > 100_000) throw new EditorialRuleError("Invalid article content");
  if (input.slug && !slugPattern.test(input.slug)) throw new EditorialRuleError("Invalid article slug");
  if (!slugPattern.test(input.categorySlug)) throw new EditorialRuleError("Invalid article category");
  if (!articleStatuses.includes(input.status)) throw new EditorialRuleError("Invalid article status");
  if (input.status === "scheduled" && (!input.scheduledFor || Number.isNaN(Date.parse(input.scheduledFor)))) {
    throw new EditorialRuleError("Scheduled articles require a valid date");
  }
  if (input.coverAlt && (input.coverAlt.trim().length < 3 || input.coverAlt.trim().length > 240)) {
    throw new EditorialRuleError("Invalid article cover description");
  }
  if (input.distribution?.some((channel) => !socialChannels.includes(channel))) {
    throw new EditorialRuleError("Invalid distribution channel");
  }
  normalizeStoryFields(input);
}

const cannotPublish = "Saving cannot publish an article. Use the publish tool, which asks for confirmation.";
const cannotUnpublish = "Saving cannot take an article off the site. Use the unpublish tool, which asks for confirmation.";

/** A new article: draft unless said otherwise, and never published. */
export function prepareCreate(input: ArticleCreate): ArticleDraftInput {
  const draft: ArticleDraftInput = { ...input, status: input.status ?? "draft" };
  if (!(draftStatuses as readonly string[]).includes(draft.status)) throw new EditorialRuleError(cannotPublish);
  assertArticleDraft(draft);
  return draft;
}

/**
 * The stored article with the given fields replaced; an omitted (or `undefined`) field keeps its
 * stored value. The publication state never changes here: a published article stays published
 * and nothing becomes published.
 */
export function preparePatch(current: Article, changes: ArticlePatch): ArticleDraftInput {
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as ArticlePatch;
  if (!Object.keys(given).length) throw new EditorialRuleError("Nothing to change: pass at least one field.");
  // The type forbids it; JSON from a tool or a script does not.
  if ((given.status as string | undefined) === "published") throw new EditorialRuleError(cannotPublish);
  if (given.status !== undefined && current.status === "published") throw new EditorialRuleError(cannotUnpublish);
  const draft: ArticleDraftInput = { ...articleToDraft(current), ...given };
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
const draftKey = (draft: ArticleDraftInput) => `${draft.locale}/${slugify(draft.slug || draft.title)}`;

/**
 * The article use cases. `create` and `patch` can never publish or unpublish: only `publish` and
 * `unpublish` change what the public sees. `save` is the exception, for the Studio form, where a
 * signed-in editor picks any status in a browser; agents and tools never call it.
 *
 * The `*Many` methods are all-or-nothing: they check every item first (references, slugs, state),
 * report every invalid item by index, and write nothing unless all are valid. `entities` is needed
 * by `createMany` and `patchMany` to check the entity links.
 */
export class ArticleCommandService {
  constructor(
    private readonly repository: ArticleRepository,
    private readonly entities?: Pick<EntityRepository, "findEntityBySlug">,
  ) {}

  /** Studio form only: saves the draft with whatever status it carries, published included. */
  async save(input: ArticleDraftInput) {
    assertArticleDraft(input);
    return this.repository.save(input);
  }

  async create(input: ArticleCreate) {
    return this.repository.save(prepareCreate(input));
  }

  async patch(current: Article, changes: ArticlePatch) {
    return this.repository.save(preparePatch(current, changes));
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
        const draft = prepareCreate(input);
        await this.checkReferences(draft);
        return draft;
      },
      (input) => input.slug ?? slugify(input.title),
      findRepeats(inputs, (input) => `${input.locale}/${slugify(input.slug || input.title)}`, repeatedSlug),
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
        if (!current) throw new EditorialRuleError(`Article ${id} not found in ${locale}.`);
        const draft = preparePatch(current, changes);
        await this.checkReferences(draft);
        return { previousSlug: current.slug, draft };
      },
      ({ id }) => id,
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
        if (!article) throw new EditorialRuleError(`Article ${id} not found in ${locale}.`);
        return article;
      },
      ({ id }) => id,
    );
  }

  /** The category, the entity links and the slug must be usable, so the write cannot fail on them halfway. */
  private async checkReferences(draft: ArticleDraftInput) {
    const [categories, taken] = await Promise.all([
      this.repository.listCategories(draft.locale),
      this.repository.findBySlug(slugify(draft.slug || draft.title), draft.locale),
    ]);
    if (!categories.some((category) => category.slug === draft.categorySlug)) {
      throw new EditorialRuleError(`Unknown category "${draft.categorySlug}" for ${draft.locale}.`);
    }
    if (taken && taken.id !== draft.id) {
      throw new EditorialRuleError(`The slug "${taken.slug}" is already used by another ${draft.locale} article.`);
    }
    for (const link of draft.entities ?? []) {
      if (!this.entities) throw new Error("The batch article use cases need an entity reader.");
      if (!(await this.entities.findEntityBySlug(link.slug, draft.locale))) {
        throw new EditorialRuleError(`Unknown entity "${link.slug}".`);
      }
    }
  }
}
