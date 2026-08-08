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
  NewsletterRepository,
} from "../domain/article-repository";
import type { Locale } from "@/i18n";
import { seedArticles, seedAuthor, seedCategories } from "./seed";

export class MemoryEditorialRepository
  implements ArticleRepository, NewsletterRepository
{
  private articles = structuredClone(seedArticles);
  private subscribers = new Map<string, Locale>();

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

    return structuredClone(article);
  }

  async delete(id: string) {
    this.articles = this.articles.filter((article) => article.id !== id);
  }

  async setDistributionChannels(id: string, channels: SocialChannel[]) {
    const article = this.articles.find((item) => item.id === id);
    if (article) article.distribution = [...channels];
  }

  async subscribe(email: string, _source: string, locale: Locale) {
    const normalized = email.trim().toLowerCase();
    if (!this.subscribers.has(normalized)) this.subscribers.set(normalized, locale);
  }
}
