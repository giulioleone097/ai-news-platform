import type { Article, ArticleDraftInput } from "../domain/article";
import { articleStatuses, socialChannels } from "../domain/article";
import type { ArticleRepository } from "../domain/article-repository";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertArticleDraft(input: ArticleDraftInput) {
  const titleLength = input.title.trim().length;
  const excerptLength = input.excerpt.trim().length;
  const contentLength = input.content.trim().length;
  if (titleLength < 8 || titleLength > 180) throw new Error("Invalid article title");
  if (excerptLength < 20 || excerptLength > 360) throw new Error("Invalid article excerpt");
  if (contentLength < 20 || contentLength > 100_000) throw new Error("Invalid article content");
  if (input.slug && !slugPattern.test(input.slug)) throw new Error("Invalid article slug");
  if (!slugPattern.test(input.categorySlug)) throw new Error("Invalid article category");
  if (!articleStatuses.includes(input.status)) throw new Error("Invalid article status");
  if (input.status === "scheduled" && (!input.scheduledFor || Number.isNaN(Date.parse(input.scheduledFor)))) {
    throw new Error("Scheduled articles require a valid date");
  }
  if (input.coverAlt && (input.coverAlt.trim().length < 3 || input.coverAlt.trim().length > 240)) {
    throw new Error("Invalid article cover description");
  }
  if (input.distribution?.some((channel) => !socialChannels.includes(channel))) {
    throw new Error("Invalid distribution channel");
  }
}

export class ArticleCommandService {
  constructor(private readonly repository: ArticleRepository) {}

  async save(input: ArticleDraftInput) {
    assertArticleDraft(input);
    return this.repository.save(input);
  }

  async publish(article: Article) {
    return this.save({
      id: article.id,
      translationKey: article.translationKey,
      locale: article.locale,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      categorySlug: article.category.slug,
      status: "published",
      featured: article.featured,
      coverImage: article.coverImage,
      coverAlt: article.coverAlt,
      scheduledFor: null,
      distribution: article.distribution,
    });
  }

  async delete(id: string) {
    return this.repository.delete(id);
  }
}
