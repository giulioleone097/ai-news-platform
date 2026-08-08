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
import { seedArticles, seedAuthor, seedCategories } from "./seed";

export class MemoryEditorialRepository
  implements ArticleRepository, NewsletterRepository
{
  private articles = structuredClone(seedArticles);
  private subscribers = new Set<string>();

  async listPublished(query: ArticleQuery = {}) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const normalizedQuery = query.query?.trim().toLocaleLowerCase("it");

    let items = this.articles
      .filter((article) => article.status === "published" && article.publishedAt)
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
          .toLocaleLowerCase("it")
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

  async listForStudio() {
    return structuredClone(
      [...this.articles].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  async findBySlug(slug: string) {
    return structuredClone(this.articles.find((article) => article.slug === slug) ?? null);
  }

  async findById(id: string) {
    return structuredClone(this.articles.find((article) => article.id === id) ?? null);
  }

  async listCategories() {
    return structuredClone(seedCategories);
  }

  async save(input: ArticleDraftInput) {
    const existingIndex = input.id
      ? this.articles.findIndex((article) => article.id === input.id)
      : -1;
    const existing = existingIndex >= 0 ? this.articles[existingIndex] : null;
    const selectedCategory =
      seedCategories.find((category) => category.slug === input.categorySlug) ??
      seedCategories[0];
    const timestamp = new Date().toISOString();
    const status = input.status;

    const article: Article = {
      id: existing?.id ?? crypto.randomUUID(),
      slug: slugify(input.slug || input.title),
      title: input.title.trim(),
      excerpt: input.excerpt.trim(),
      content: input.content.trim(),
      coverImage: input.coverImage || existing?.coverImage || "/media/neura-agents-hero.png",
      coverAlt: input.coverAlt || existing?.coverAlt || `Immagine per ${input.title}`,
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

  async subscribe(email: string) {
    const normalized = email.trim().toLowerCase();
    if (this.subscribers.has(normalized)) return "existing" as const;
    this.subscribers.add(normalized);
    return "created" as const;
  }
}
