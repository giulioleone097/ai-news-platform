import {
  estimateReadingMinutes,
  slugify,
  type Article,
  type ArticleDraftInput,
  type ArticleQuery,
  type SocialChannel,
} from "../domain/article";
import type {
  ArticleRepository,
  DistributionRepository,
  MediaRepository,
  NewsletterRepository,
} from "../domain/article-repository";
import type {
  DistributionPublication,
  DistributionUpdate,
  MediaUpload,
  NewsletterQuery,
  NewsletterStatus,
  NewsletterSubscription,
} from "../domain/editorial-operations";
import type { Locale } from "@/i18n";
import { getEditorialMediaReferenceKey } from "@/lib/editorial-image";
import { seedArticles, seedAuthor, seedCategories } from "./seed";

export class MemoryEditorialRepository
  implements ArticleRepository, NewsletterRepository, DistributionRepository, MediaRepository
{
  private articles = structuredClone(seedArticles);
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

  async listForStudio(locale: Locale) {
    return structuredClone(
      this.articles
        .filter((article) => article.locale === locale)
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

  async listCategories(locale: Locale) {
    return structuredClone(
      seedCategories.filter((category) => category.locale === locale),
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
      seedCategories.find(
        (category) =>
          category.locale === input.locale && category.slug === input.categorySlug,
      );
    if (!selectedCategory) {
      throw new Error(
        `Unknown article category ${input.categorySlug} for locale ${input.locale}`,
      );
    }
    const timestamp = new Date().toISOString();
    const status = input.status;
    const slug = slugify(input.slug || input.title);
    const translationKey =
      existing?.translationKey ?? input.translationKey ?? crypto.randomUUID();
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
    };

    if (existingIndex >= 0) this.articles[existingIndex] = article;
    else this.articles.unshift(article);
    await this.setDistributionChannels(article.id, article.distribution);

    return structuredClone(article);
  }

  async delete(id: string) {
    this.articles = this.articles.filter((article) => article.id !== id);
    for (const [publicationId, publication] of this.publications) {
      if (publication.articleId === id) this.publications.delete(publicationId);
    }
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

  async updateSubscriptionStatus(id: string, status: NewsletterStatus) {
    const subscription = [...this.subscribers.values()].find((item) => item.id === id);
    if (!subscription) throw new Error("Newsletter subscription not found");
    subscription.status = status;
    subscription.unsubscribedAt = status === "unsubscribed" ? new Date().toISOString() : null;
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

  async isAssetReferenced(path: string) {
    return this.articles.some(
      (article) => getEditorialMediaReferenceKey(article.coverImage) === path,
    );
  }

  async uploadAsset(input: MediaUpload): Promise<never> {
    void input;
    throw new Error("Media uploads require Supabase Storage");
  }

  async deleteAsset(path: string): Promise<never> {
    void path;
    throw new Error("Bundled demo assets cannot be deleted");
  }
}
