import "server-only";

import { unstable_cache } from "next/cache";
import type { Locale } from "@/i18n";
import type { ArticleQuery } from "../domain/article";
import { getHomeFeed } from "../domain/editorial-service";
import { getPublicEditorialRepositories } from "../infrastructure/container";

export const getCachedHomeFeed = unstable_cache(
  async (locale: Locale) => {
    const { articles } = getPublicEditorialRepositories();
    return getHomeFeed(articles, locale);
  },
  ["neura-home-feed-v2"],
  { revalidate: 60, tags: ["articles"] },
);

export const getCachedArticle = unstable_cache(
  async (slug: string, locale: Locale) => {
    const { articles } = getPublicEditorialRepositories();
    const article = await articles.findBySlug(slug, locale);
    return article?.status === "published" ? article : null;
  },
  ["neura-article-v2"],
  { revalidate: 300, tags: ["articles"] },
);

export async function searchPublishedArticles(input: ArticleQuery) {
  const { articles } = getPublicEditorialRepositories();
  return articles.listPublished(input);
}

export async function getPublicCategories(locale: Locale) {
  const { articles } = getPublicEditorialRepositories();
  return articles.listCategories(locale);
}
