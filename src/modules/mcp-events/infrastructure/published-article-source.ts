import type { ArticleCursor } from "@/modules/editorial/domain/article";
import type { ArticleRepository } from "@/modules/editorial/domain/article-repository";
import type { Locale } from "@/i18n";

import type { PublishedArticle } from "../domain/events";
import type { PublishedArticleSource } from "../domain/ports";

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
        });
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return found;
  }
}
