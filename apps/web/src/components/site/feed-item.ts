import type { Article, ClaimStatus } from "@atlasnews/core/editorial/domain/article";

/** What one row of a dated feed needs; the lead story is rendered from the full article. */
export interface FeedItem {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  claimStatus: ClaimStatus;
  category: { slug: string; name: string };
  /** The primary entity; null when the story links none. */
  entity: { slug: string; name: string } | null;
}

export function toFeedItem(article: Article): FeedItem {
  const entity = article.entities.find((item) => item.isPrimary) ?? article.entities[0];
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    publishedAt: article.publishedAt,
    claimStatus: article.claimStatus,
    category: { slug: article.category.slug, name: article.category.name },
    entity: entity ? { slug: entity.slug, name: entity.name } : null,
  };
}
