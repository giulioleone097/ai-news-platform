import "server-only";

import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n";
import type { ArticleQuery } from "@atlasnews/core/editorial/domain/article";
import { getHomeFeed, rankEntities } from "@atlasnews/core/editorial/domain/editorial-service";
import { getPublicEditorialRepositories } from "@/server/composition";
import { articlesCacheTag } from "./editorial-cache";

export const getCachedHomeFeed = unstable_cache(
  async (locale: Locale) => {
    const { articles } = getPublicEditorialRepositories();
    return getHomeFeed(articles, locale);
  },
  ["neura-home-feed-v3"],
  { revalidate: 60, tags: [articlesCacheTag] },
);

export const getCachedArticle = unstable_cache(
  async (slug: string, locale: Locale) => {
    const { articles } = getPublicEditorialRepositories();
    const article = await articles.findBySlug(slug, locale);
    return article?.status === "published" ? article : null;
  },
  ["neura-article-v2"],
  { revalidate: 300, tags: [articlesCacheTag] },
);

/** Every entity with its story count, the most covered first (see `rankEntities`). */
export const getCachedEntities = unstable_cache(
  async (locale: Locale) => {
    const { entities } = getPublicEditorialRepositories();
    return rankEntities(await entities.listEntities(locale));
  },
  ["neura-entities-v1"],
  { revalidate: 60, tags: [articlesCacheTag] },
);

/** An entity with its published stories, oldest first; null when the slug names no entity. */
export const getCachedEntityPage = unstable_cache(
  async (slug: string, locale: Locale) => {
    const { entities } = getPublicEditorialRepositories();
    const entity = await entities.findEntityBySlug(slug, locale);
    if (!entity) return null;
    return { entity, timeline: await entities.listEntityTimeline(slug, locale) };
  },
  ["neura-entity-page-v1"],
  { revalidate: 60, tags: [articlesCacheTag] },
);

export async function searchPublishedArticles(input: ArticleQuery) {
  return getPublicEditorialRepositories().articles.listPublished(input);
}

export async function getPublicCategories(locale: Locale) {
  return getPublicEditorialRepositories().articles.listCategories(locale);
}
