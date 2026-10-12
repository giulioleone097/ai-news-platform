import {
  estimateReadingMinutes,
  normalizeStoryFields,
  orderEntityRefs,
  slugify,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type Category,
  type SocialChannel,
  type StudioArticleFilter,
} from "@atlasnews/core/editorial/domain/article";
import type {
  CategoryAdminRepository,
  CategoryRecord,
  CategoryWrite,
} from "@atlasnews/core/editorial/domain/category";
import type {
  EntityAdminRepository,
  EntityDetail,
  EntityKind,
  EntityRecord,
  EntityRepository,
  EntitySummary,
  EntityTimelineItem,
  EntityWrite,
} from "@atlasnews/core/editorial/domain/entity";
import type {
  ArticleRepository,
  DistributionRepository,
  MediaRepository,
  NewsletterRepository,
} from "@atlasnews/core/editorial/domain/article-repository";
import {
  canEditorSetNewsletterStatus,
  type DistributionPublication,
  type DistributionUpdate,
  type MediaUpload,
  type NewsletterQuery,
  type NewsletterStatus,
  type NewsletterSubscription,
} from "@atlasnews/core/editorial/domain/editorial-operations";
import { locales, type Locale } from "@atlasnews/core/locale";
import { getEditorialMediaReferenceKey } from "@atlasnews/core/editorial/domain/editorial-image";
import { seedArticles, seedAuthor, seedCategories, seedEntities, type SeedEntity } from "./seed";

/** A seed entity whose descriptions may be missing for a locale. */
type StoredEntity = Omit<SeedEntity, "description"> & { description: Partial<Record<Locale, string>> };

export class MemoryEditorialRepository
  implements
    ArticleRepository,
    CategoryAdminRepository,
    EntityRepository,
    EntityAdminRepository,
    NewsletterRepository,
    DistributionRepository,
    MediaRepository
{
  private articles = structuredClone(seedArticles);
  private categories: Category[] = structuredClone(seedCategories);
  /** Position of each category by translation key: the order of the seed. */
  private categoryPositions = new Map(
    [...new Set(seedCategories.map((category) => category.translationKey))].map((key, index) => [key, index + 1]),
  );
  private entities = new Map<string, StoredEntity>(seedEntities.map((entity) => [entity.slug, structuredClone(entity)]));
  private subscribers = new Map<string, NewsletterSubscription>();
  private publications = new Map<string, DistributionPublication>();
  readonly writable = false;

  constructor() {
    for (const article of this.articles) {
      for (const channel of article.distribution) {
        const id = `${article.id}:${channel}`;
        this.publications.set(id, {
          id,
          articleId: article.id,
          articleLocale: article.locale,
          articleSlug: article.slug,
          articleTitle: article.title,
          channel,
          status: "ready",
          message: article.excerpt,
          externalUrl: null,
          scheduledFor: article.scheduledFor,
          publishedAt: null,
          updatedAt: article.updatedAt,
        });
      }
    }
  }

  async listPublished(query: ArticleQuery) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const languageTag = query.locale === "it" ? "it-IT" : "en-US";
    const normalizedQuery = query.query?.trim().toLocaleLowerCase(languageTag);

    let items = this.articles
      .filter(
        (article) =>
          article.locale === query.locale &&
          article.status === "published" &&
          article.publishedAt,
      )
      .sort((left, right) => {
        const byDate = (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
        return byDate || right.id.localeCompare(left.id);
      });

    if (query.category) {
      items = items.filter((article) => article.category.slug === query.category);
    }

    if (query.entity) {
      items = items.filter((article) => article.entities.some((entity) => entity.slug === query.entity));
    }

    if (query.claimStatus) {
      items = items.filter((article) => article.claimStatus === query.claimStatus);
    }

    if (normalizedQuery) {
      items = items.filter((article) =>
        [article.title, article.excerpt, article.content, article.category.name]
          .join(" ")
          .toLocaleLowerCase(languageTag)
          .includes(normalizedQuery),
      );
    }

    if (query.cursor) {
      items = items.filter((article) => {
        const publishedAt = article.publishedAt ?? "";
        return (
          publishedAt < query.cursor!.publishedAt ||
          (publishedAt === query.cursor!.publishedAt && article.id < query.cursor!.id)
        );
      });
    }

    const pageItems = items.slice(0, limit);
    const last = pageItems.at(-1);

    return {
      items: structuredClone(pageItems),
      nextCursor:
        items.length > limit && last?.publishedAt
          ? { id: last.id, publishedAt: last.publishedAt }
          : null,
    };
  }

  async listForStudio(locale: Locale, filter: StudioArticleFilter = {}) {
    const words = filter.query?.trim().toLocaleLowerCase(locale === "it" ? "it-IT" : "en-US");
    return structuredClone(
      this.articles
        .filter((article) => article.locale === locale)
        .filter((article) => !filter.status || article.status === filter.status)
        .filter((article) => !filter.category || article.category.slug === filter.category)
        .filter((article) => !filter.entity || article.entities.some((entity) => entity.slug === filter.entity))
        .filter((article) => !filter.claimStatus || article.claimStatus === filter.claimStatus)
        .filter((article) => !words || [article.title, article.excerpt, article.content].join(" ").toLocaleLowerCase().includes(words))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async findBySlug(slug: string, locale: Locale) {
    return structuredClone(
      this.articles.find(
        (article) => article.locale === locale && article.slug === slug,
      ) ?? null,
    );
  }

  async findById(id: string, locale: Locale) {
    return structuredClone(
      this.articles.find(
        (article) => article.locale === locale && article.id === id,
      ) ?? null,
    );
  }

  async findByTranslationKey(translationKey: string, locale: Locale) {
    return structuredClone(
      this.articles.find(
        (article) => article.locale === locale && article.translationKey === translationKey,
      ) ?? null,
    );
  }

  async listCategories(locale: Locale) {
    return structuredClone(
      this.categories
        .filter((category) => category.locale === locale)
        .sort((left, right) => this.positionOf(left.translationKey) - this.positionOf(right.translationKey)),
    );
  }

  async save(input: ArticleDraftInput) {
    const existingIndex = input.id
      ? this.articles.findIndex((article) => article.id === input.id)
      : -1;
    const existing = existingIndex >= 0 ? this.articles[existingIndex] : null;
    if (input.id && !existing) {
      throw new Error(`Article ${input.id} does not exist`);
    }
    if (existing && existing.locale !== input.locale) {
      throw new Error(`Article ${input.id} does not belong to locale ${input.locale}`);
    }
    const selectedCategory =
      this.categories.find(
        (category) =>
          category.locale === input.locale && category.slug === input.categorySlug,
      );
    if (!selectedCategory) {
      throw new Error(
        `Unknown article category ${input.categorySlug} for locale ${input.locale}`,
      );
    }
    const story = normalizeStoryFields(input);
    const entities = story.entities
      ? orderEntityRefs(story.entities.map((link) => {
          const entity = this.entities.get(link.slug);
          if (!entity) throw new Error(`Unknown entity ${link.slug}`);
          return { kind: entity.kind, slug: entity.slug, name: entity.name, isPrimary: link.isPrimary };
        }))
      : existing?.entities ?? [];
    const timestamp = new Date().toISOString();
    const status = input.status;
    const slug = slugify(input.slug || input.title);
    // A key the caller names links the article to its translation; without one the article keeps its own.
    const translationKey =
      input.translationKey ?? existing?.translationKey ?? crypto.randomUUID();
    const duplicate = this.articles.find(
      (article) =>
        article.id !== existing?.id &&
        article.locale === input.locale &&
        (article.slug === slug || article.translationKey === translationKey),
    );
    if (duplicate) {
      throw new Error(`A translation with this slug or key already exists in ${input.locale}`);
    }

    const article: Article = {
      id: existing?.id ?? crypto.randomUUID(),
      translationKey,
      locale: input.locale,
      slug,
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      content: input.content.trim(),
      coverImage: input.coverImage || existing?.coverImage || "/media/neura-agents-hero.webp",
      coverAlt:
        input.coverAlt ||
        existing?.coverAlt ||
        (input.locale === "it" ? `Immagine per ${input.title}` : `Image for ${input.title}`),
      status,
      category: selectedCategory,
      author: existing?.author ?? seedAuthor,
      featured: Boolean(input.featured),
      readingMinutes: estimateReadingMinutes(input.content),
      publishedAt:
        status === "published" ? existing?.publishedAt ?? timestamp : existing?.publishedAt ?? null,
      scheduledFor: status === "scheduled" ? input.scheduledFor ?? null : null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      distribution: input.distribution ?? existing?.distribution ?? [],
      claimStatus: story.claimStatus ?? existing?.claimStatus ?? "analysis",
      keyPoints: story.keyPoints ?? existing?.keyPoints ?? [],
      sources: story.sources ?? existing?.sources ?? [],
      entities,
    };

    if (existingIndex >= 0) this.articles[existingIndex] = article;
    else this.articles.unshift(article);
    await this.setDistributionChannels(article.id, article.distribution);

    return structuredClone(article);
  }

  private publishedStories(slug: string, locale: Locale) {
    return this.articles
      .filter(
        (article) =>
          article.locale === locale
          && article.status === "published"
          && article.publishedAt
          && article.entities.some((entity) => entity.slug === slug),
      )
      .sort((left, right) => (left.publishedAt ?? "").localeCompare(right.publishedAt ?? "") || left.id.localeCompare(right.id));
  }

  private toEntityDetail(entity: StoredEntity, locale: Locale): EntityDetail {
    const parent = entity.parent ? this.entities.get(entity.parent) : undefined;
    return {
      id: entity.id,
      kind: entity.kind,
      slug: entity.slug,
      name: entity.name,
      officialUrl: entity.officialUrl,
      parent: parent ? { slug: parent.slug, name: parent.name } : null,
      description: entity.description[locale] ?? "",
    };
  }

  async listEntities(locale: Locale, kind?: EntityKind): Promise<EntitySummary[]> {
    return [...this.entities.values()]
      .filter((entity) => !kind || entity.kind === kind)
      .map((entity) => ({
        ...this.toEntityDetail(entity, locale),
        storyCount: this.publishedStories(entity.slug, locale).length,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async findEntityBySlug(slug: string, locale: Locale) {
    const entity = this.entities.get(slug);
    return entity ? this.toEntityDetail(entity, locale) : null;
  }

  async listEntityTimeline(slug: string, locale: Locale): Promise<EntityTimelineItem[]> {
    return this.publishedStories(slug, locale).map((article) => ({
      slug: article.slug,
      title: article.title,
      claimStatus: article.claimStatus,
      publishedAt: article.publishedAt ?? "",
    }));
  }

  async delete(id: string) {
    this.articles = this.articles.filter((article) => article.id !== id);
    for (const [publicationId, publication] of this.publications) {
      if (publication.articleId === id) this.publications.delete(publicationId);
    }
  }

  /**
   * The memory counterpart of a database transaction: the state before the work is restored when the
   * work throws, so a batch never leaves half of its items behind.
   */
  private async atomic<T>(work: () => Promise<T> | T): Promise<T> {
    const before = structuredClone({
      articles: this.articles,
      categories: this.categories,
      categoryPositions: this.categoryPositions,
      entities: this.entities,
      publications: this.publications,
    });
    try {
      return await work();
    } catch (error) {
      Object.assign(this, before);
      throw error;
    }
  }

  async saveMany(inputs: ArticleDraftInput[]) {
    return this.atomic(async () => {
      const saved: Article[] = [];
      for (const input of inputs) saved.push(await this.save(input));
      return saved;
    });
  }

  async setPublished(ids: string[], published: boolean) {
    return this.atomic(() => {
      const timestamp = new Date().toISOString();
      const targets = [...new Set(ids)].map((id) => {
        const article = this.articles.find((item) => item.id === id);
        if (!article) throw new Error(`Article ${id} not found`);
        return article;
      });
      for (const article of targets) {
        article.status = published ? "published" : "draft";
        article.publishedAt = published ? article.publishedAt ?? timestamp : article.publishedAt;
        article.scheduledFor = null;
        article.updatedAt = timestamp;
      }
      return structuredClone(targets);
    });
  }

  async deleteMany(ids: string[]) {
    await this.atomic(async () => {
      for (const id of ids) {
        if (!this.articles.some((article) => article.id === id)) throw new Error(`Article ${id} not found`);
      }
      for (const id of ids) await this.delete(id);
    });
  }

  private positionOf(translationKey: string) {
    return this.categoryPositions.get(translationKey) ?? Number.MAX_SAFE_INTEGER;
  }

  private categoryRecord(translationKey: string): CategoryRecord {
    const translations: CategoryRecord["translations"] = {};
    for (const category of this.categories.filter((item) => item.translationKey === translationKey)) {
      const { id, slug, name, description } = category;
      translations[category.locale] = { id, slug, name, description };
    }
    return { translationKey, position: this.positionOf(translationKey), translations };
  }

  async listCategoryRecords() {
    return [...this.categoryPositions.keys()]
      .sort((left, right) => this.positionOf(left) - this.positionOf(right))
      .map((key) => this.categoryRecord(key));
  }

  private writeCategory(item: CategoryWrite, create: boolean) {
    this.categoryPositions.set(item.translationKey, item.position);
    for (const locale of locales) {
      const text = item.translations[locale];
      if (!text) continue;
      const index = this.categories.findIndex((category) => category.translationKey === item.translationKey && category.locale === locale);
      if (create === (index >= 0)) throw new Error(`Category ${item.translationKey}/${locale} ${create ? "already exists" : "does not exist"}`);
      const category: Category = {
        id: this.categories[index]?.id ?? `cat-${item.translationKey}-${locale}`,
        translationKey: item.translationKey,
        locale,
        ...text,
      };
      if (index >= 0) this.categories[index] = category;
      else this.categories.push(category);
      for (const article of this.articles) {
        if (article.category.id === category.id) article.category = { ...category };
      }
    }
  }

  async createCategories(items: CategoryWrite[]) {
    return this.atomic(() => {
      for (const item of items) this.writeCategory(item, true);
      return items.map((item) => this.categoryRecord(item.translationKey));
    });
  }

  async updateCategories(items: CategoryWrite[]) {
    return this.atomic(() => {
      for (const item of items) this.writeCategory(item, false);
      return items.map((item) => this.categoryRecord(item.translationKey));
    });
  }

  async deleteCategories(translationKeys: string[]) {
    await this.atomic(() => {
      for (const key of translationKeys) {
        if (this.countArticlesIn(key)) throw new Error(`Category ${key} is in use`);
        if (!this.categoryPositions.delete(key)) throw new Error(`Category ${key} not found`);
        this.categories = this.categories.filter((category) => category.translationKey !== key);
      }
    });
  }

  private countArticlesIn(translationKey: string) {
    return this.articles.filter((article) => article.category.translationKey === translationKey).length;
  }

  async countCategoryArticles(translationKeys: string[]) {
    return new Map(translationKeys.map((key) => [key, this.countArticlesIn(key)]));
  }

  private entityRecord(entity: StoredEntity): EntityRecord {
    const parent = entity.parent ? this.entities.get(entity.parent) : undefined;
    return {
      id: entity.id,
      kind: entity.kind,
      slug: entity.slug,
      name: entity.name,
      officialUrl: entity.officialUrl,
      parent: parent ? { slug: parent.slug, name: parent.name } : null,
      descriptions: { ...entity.description },
    };
  }

  async listEntityRecords() {
    return [...this.entities.values()].map((entity) => this.entityRecord(entity));
  }

  private writeEntity(item: EntityWrite, create: boolean) {
    const existing = this.entities.get(item.slug);
    if (create === Boolean(existing)) throw new Error(`Entity ${item.slug} ${create ? "already exists" : "does not exist"}`);
    if (item.parentSlug && this.entities.get(item.parentSlug)?.kind !== "company") {
      throw new Error(`The parent of ${item.slug} must be a company`);
    }
    this.entities.set(item.slug, {
      id: existing?.id ?? crypto.randomUUID(),
      kind: item.kind,
      slug: item.slug,
      name: item.name,
      officialUrl: item.officialUrl,
      parent: item.parentSlug,
      description: { ...item.descriptions },
    });
    // Stories show the name and kind of the entities they link.
    for (const article of this.articles) {
      for (const link of article.entities) {
        if (link.slug === item.slug) Object.assign(link, { kind: item.kind, name: item.name });
      }
    }
  }

  async createEntities(items: EntityWrite[]) {
    return this.atomic(() => {
      for (const item of items) this.writeEntity(item, true);
      return items.map((item) => this.entityRecord(this.entities.get(item.slug)!));
    });
  }

  async updateEntities(items: EntityWrite[]) {
    return this.atomic(() => {
      for (const item of items) this.writeEntity(item, false);
      return items.map((item) => this.entityRecord(this.entities.get(item.slug)!));
    });
  }

  async deleteEntities(slugs: string[]) {
    await this.atomic(() => {
      for (const slug of slugs) {
        if (!this.entities.has(slug)) throw new Error(`Entity ${slug} not found`);
        if (this.articles.some((article) => article.entities.some((link) => link.slug === slug))) {
          throw new Error(`Entity ${slug} is linked to stories`);
        }
        if ([...this.entities.values()].some((other) => other.parent === slug)) {
          throw new Error(`Entity ${slug} is the parent of other entities`);
        }
        this.entities.delete(slug);
      }
    });
  }

  async countEntityStories(slugs: string[]) {
    return new Map(slugs.map((slug) => [
      slug,
      this.articles.filter((article) => article.entities.some((link) => link.slug === slug)).length,
    ]));
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    const article = this.articles.find((item) => item.id === id);
    if (!article) return;

    const desired = new Set(channels);
    article.distribution = [...desired];
    for (const [publicationId, publication] of this.publications) {
      if (
        publication.articleId === id &&
        publication.status !== "published" &&
        !desired.has(publication.channel)
      ) {
        this.publications.delete(publicationId);
      }
    }
    for (const channel of desired) {
      const publicationId = `${article.id}:${channel}`;
      if (this.publications.has(publicationId)) continue;
      this.publications.set(publicationId, {
        id: publicationId,
        articleId: article.id,
        articleLocale: article.locale,
        articleSlug: article.slug,
        articleTitle: article.title,
        channel,
        status: "ready",
        message: article.excerpt,
        externalUrl: null,
        scheduledFor: article.scheduledFor,
        publishedAt: null,
        updatedAt: article.updatedAt,
      });
    }
  }

  async subscribe(email: string, source: string, locale: Locale) {
    const normalized = email.trim().toLowerCase();
    const existing = this.subscribers.get(normalized);
    if (existing) {
      if (existing.status === "unsubscribed") return;
      existing.locale = locale;
      existing.source = source;
      return;
    }
    const now = new Date().toISOString();
    this.subscribers.set(normalized, {
      id: crypto.randomUUID(),
      email: normalized,
      source,
      locale,
      status: "active",
      consentedAt: now,
      unsubscribedAt: null,
      createdAt: now,
    });
  }

  async listSubscriptions(query: NewsletterQuery) {
    const normalizedQuery = query.query?.trim().toLowerCase();
    const offset = Math.max(query.offset ?? 0, 0);
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 1_000);
    const subscriptions = [...this.subscribers.values()]
      .filter((subscription) => subscription.locale === query.locale)
      .filter((subscription) => !query.status || subscription.status === query.status)
      .filter((subscription) => !normalizedQuery || subscription.email.includes(normalizedQuery))
      .sort((left, right) => {
        const byDate = right.createdAt.localeCompare(left.createdAt);
        return byDate || right.id.localeCompare(left.id);
      });
    const items = subscriptions.slice(offset, offset + limit);

    return {
      items: structuredClone(items),
      total: subscriptions.length,
      offset,
      limit,
      hasMore: offset + items.length < subscriptions.length,
    };
  }

  async findSubscription(id: string) {
    const subscription = [...this.subscribers.values()].find((item) => item.id === id);
    return subscription ? structuredClone(subscription) : null;
  }

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    const subscription = [...this.subscribers.values()].find((item) => item.id === id);
    if (!subscription) throw new Error("Newsletter subscription not found");
    if (!canEditorSetNewsletterStatus(subscription.status, status)) {
      throw new Error("Newsletter reactivation requires double opt-in");
    }
    subscription.status = status;
    subscription.unsubscribedAt = subscription.unsubscribedAt ?? new Date().toISOString();
  }

  async listPublications(locale: Locale) {
    return structuredClone(
      [...this.publications.values()]
        .filter((publication) => publication.articleLocale === locale)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async updatePublication(input: DistributionUpdate) {
    const publication = this.publications.get(input.id);
    if (!publication) throw new Error("Distribution publication not found");
    publication.status = input.status;
    publication.message = input.message?.trim() ?? publication.message;
    publication.externalUrl = input.externalUrl ?? null;
    publication.scheduledFor = input.scheduledFor ?? null;
    publication.publishedAt = input.status === "published"
      ? publication.publishedAt ?? new Date().toISOString()
      : null;
    publication.updatedAt = new Date().toISOString();
    return structuredClone(publication);
  }

  async listAssets() {
    return [{
      path: "media/neura-agents-hero.webp",
      url: "/media/neura-agents-hero.webp",
      name: "neura-agents-hero.webp",
      mimeType: "image/webp",
      size: 129_262,
      createdAt: seedArticles.at(-1)?.createdAt ?? new Date(0).toISOString(),
    }];
  }

  async findAsset(path: string) {
    return (await this.listAssets()).find((asset) => asset.path === path) ?? null;
  }

  async isAssetReferenced(path: string) {
    return this.articles.some(
      (article) => getEditorialMediaReferenceKey(article.coverImage) === path,
    );
  }

  async uploadAsset(input: MediaUpload): Promise<never> {
    void input;
    throw new Error("Media uploads require media storage");
  }

  async deleteAsset(path: string): Promise<never> {
    void path;
    throw new Error("Bundled demo assets cannot be deleted");
  }

  async deleteAssets(paths: string[]): Promise<never> {
    void paths;
    throw new Error("Bundled demo assets cannot be deleted");
  }
}
