import "server-only";

import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n";
import type { ArticleQuery } from "@/modules/editorial/domain/article";
import { getHomeFeed } from "@/modules/editorial/domain/editorial-service";
import { getPublicEditorialRepositories } from "@/modules/editorial/infrastructure/container";
import { articlesCacheTag } from "./editorial-cache";

export const getCachedHomeFeed = unstable_cache(
  async (locale: Locale) => {
    const { articles } = getPublicEditorialRepositories();
    return getHomeFeed(articles, locale);
  },
  ["neura-home-feed-v2"],
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

export async function searchPublishedArticles(input: ArticleQuery) {
  return getPublicEditorialRepositories().articles.listPublished(input);
}

export async function getPublicCategories(locale: Locale) {
  return getPublicEditorialRepositories().articles.listCategories(locale);
}
