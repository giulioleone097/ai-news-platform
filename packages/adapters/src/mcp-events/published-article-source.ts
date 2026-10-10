import type { ArticleCursor } from "@atlasnews/core/editorial/domain/article";
import type { ArticleRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { Locale } from "@atlasnews/core/locale";

import type { PublishedArticle } from "@atlasnews/core/mcp-events/domain/events";
import type { PublishedArticleSource } from "@atlasnews/core/mcp-events/domain/ports";

const pageSize = 50;
// ceiling: reads at most 500 articles per locale per run; upgrade to a publishedAt-ranged
// editorial query if more than that can be published within one checkpoint window.
const maximumPages = 10;

/** Adapts the editorial read port (newest-first pagination) to "published after" queries. */
export class EditorialPublishedArticleSource implements PublishedArticleSource {
  constructor(private readonly articles: Pick<ArticleRepository, "listPublished">) {}

  async listPublishedAfter(locale: Locale, after: Date) {
    const found: PublishedArticle[] = [];
    let cursor: ArticleCursor | undefined;
    for (let page = 0; page < maximumPages; page += 1) {
      const result = await this.articles.listPublished({ locale, limit: pageSize, cursor });
      for (const article of result.items) {
        if (!article.publishedAt || Date.parse(article.publishedAt) <= after.getTime()) return found;
        found.push({
          id: article.id,
          slug: article.slug,
          locale: article.locale,
          title: article.title,
          excerpt: article.excerpt,
          categorySlug: article.category.slug,
          categoryName: article.category.name,
          publishedAt: new Date(article.publishedAt).toISOString(),
          claimStatus: article.claimStatus,
          entitySlugs: article.entities.map((entity) => entity.slug),
        });
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return found;
  }
}
