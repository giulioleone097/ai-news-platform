import "server-only";

import { unstable_cache } from "next/cache";
import type { Article, ArticleCursor } from "@atlasnews/core/editorial/domain/article";
import type { EntitySummary } from "@atlasnews/core/editorial/domain/entity";
import type { Locale } from "@/i18n";
import { articlesCacheTag } from "@/lib/editorial-cache";
import { searchPublishedArticles } from "@/lib/editorial-queries";
import { getPublicEditorialRepositories } from "@/server/composition";

/** The entity with its published stories, cached and invalidated with the article cache. */
export const getEntityPage = unstable_cache(
  async (slug: string, locale: Locale) => {
    const { entities } = getPublicEditorialRepositories();
    const [entity, timeline] = await Promise.all([
      entities.findEntityBySlug(slug, locale),
      entities.listEntityTimeline(slug, locale),
    ]);
    return entity ? { entity, timeline } : null;
  },
  ["neura-entity-page-v1"],
  { revalidate: 300, tags: [articlesCacheTag] },
);

/** Entities that have at least one published story in the locale. */
export async function getCoveredEntities(locale: Locale): Promise<EntitySummary[]> {
  const entities = await getPublicEditorialRepositories().entities.listEntities(locale);
  return entities.filter((entity) => entity.storyCount > 0);
}

/** Published stories of a locale that are dated at or after `since`, newest first. */
export async function getStoriesPublishedSince(locale: Locale, since: Date): Promise<Article[]> {
  const stories: Article[] = [];
  let cursor: ArticleCursor | undefined;
  do {
    const page = await searchPublishedArticles({ locale, limit: 50, cursor });
    for (const article of page.items) {
      if (!article.publishedAt || Date.parse(article.publishedAt) < since.getTime()) return stories;
      stories.push(article);
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return stories;
}
