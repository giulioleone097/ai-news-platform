import {
  defaultCoverImage,
  estimateReadingMinutes,
  normalizeStoryFields,
  orderEntityRefs,
  slugify,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
  type StudioArticleFilter,
} from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { Locale } from "@atlasnews/core/locale";
import { seedAuthor } from "../seed";
import type { MemoryEditorialStore } from "./store";

/** Articles, their category list, publication state and distribution channels. */
export class MemoryArticleRepository implements ArticleRepository {
  constructor(private readonly store: MemoryEditorialStore) {}

  async listPublished(query: ArticleQuery) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const languageTag = query.locale === "it" ? "it-IT" : "en-US";
    const normalizedQuery = query.query?.trim().toLocaleLowerCase(languageTag);

    let items = this.store.articles
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
      this.store.articles
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
      this.store.articles.find(
        (article) => article.locale === locale && article.slug === slug,
      ) ?? null,
    );
  }

  async findById(id: string, locale: Locale) {
    return structuredClone(
      this.store.articles.find(
        (article) => article.locale === locale && article.id === id,
      ) ?? null,
    );
  }

  async findByTranslationKey(translationKey: string, locale: Locale) {
    return structuredClone(
      this.store.articles.find(
        (article) => article.locale === locale && article.translationKey === translationKey,
      ) ?? null,
    );
  }

  async listCategories(locale: Locale) {
    return structuredClone(
      this.store.categories
        .filter((category) => category.locale === locale)
        .sort((left, right) => this.store.positionOf(left.translationKey) - this.store.positionOf(right.translationKey)),
    );
  }

  async save(input: ArticleDraftInput) {
    const existingIndex = input.id
      ? this.store.articles.findIndex((article) => article.id === input.id)
      : -1;
    const existing = existingIndex >= 0 ? this.store.articles[existingIndex] : null;
    if (input.id && !existing) {
      throw new Error(`Article ${input.id} does not exist`);
    }
    if (existing && existing.locale !== input.locale) {
      throw new Error(`Article ${input.id} does not belong to locale ${input.locale}`);
    }
    const selectedCategory =
      this.store.categories.find(
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
          const entity = this.store.entities.get(link.slug);
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
    const duplicate = this.store.articles.find(
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
      coverImage: input.coverImage || existing?.coverImage || defaultCoverImage,
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

    if (existingIndex >= 0) this.store.articles[existingIndex] = article;
    else this.store.articles.unshift(article);
    await this.setDistributionChannels(article.id, article.distribution);

    return structuredClone(article);
  }

  async saveMany(inputs: ArticleDraftInput[]) {
    return this.store.atomic(async () => {
      const saved: Article[] = [];
      for (const input of inputs) saved.push(await this.save(input));
      return saved;
    });
  }

  async setPublished(ids: string[], published: boolean) {
    return this.store.atomic(() => {
      const timestamp = new Date().toISOString();
      const targets = [...new Set(ids)].map((id) => {
        const article = this.store.articles.find((item) => item.id === id);
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

  async delete(id: string) {
    this.store.articles = this.store.articles.filter((article) => article.id !== id);
    for (const [publicationId, publication] of this.store.publications) {
      if (publication.articleId === id) this.store.publications.delete(publicationId);
    }
  }

  async deleteMany(ids: string[]) {
    await this.store.atomic(async () => {
      for (const id of ids) {
        if (!this.store.articles.some((article) => article.id === id)) throw new Error(`Article ${id} not found`);
      }
      for (const id of ids) await this.delete(id);
    });
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    const article = this.store.articles.find((item) => item.id === id);
    if (!article) return;

    const desired = new Set(channels);
    article.distribution = [...desired];
    for (const [publicationId, publication] of this.store.publications) {
      if (
        publication.articleId === id &&
        publication.status !== "published" &&
        !desired.has(publication.channel)
      ) {
        this.store.publications.delete(publicationId);
      }
    }
    for (const channel of desired) {
      const publicationId = `${article.id}:${channel}`;
      if (this.store.publications.has(publicationId)) continue;
      this.store.publications.set(publicationId, {
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
}
