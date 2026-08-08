import "server-only";

import { unstable_cache } from "next/cache";
import { getHomeFeed } from "../domain/editorial-service";
import { getPublicEditorialRepositories } from "../infrastructure/container";

export const getCachedHomeFeed = unstable_cache(
  async () => {
    const { articles } = getPublicEditorialRepositories();
    return getHomeFeed(articles);
  },
  ["neura-home-feed-v1"],
  { revalidate: 60, tags: ["articles"] },
);

export const getCachedArticle = unstable_cache(
  async (slug: string) => {
    const { articles } = getPublicEditorialRepositories();
    return articles.findBySlug(slug);
  },
  ["neura-article-v1"],
  { revalidate: 300, tags: ["articles"] },
);

export async function searchPublishedArticles(input: {
  query?: string;
  category?: string;
  limit?: number;
}) {
  const { articles } = getPublicEditorialRepositories();
  return articles.listPublished(input);
}

export async function getPublicCategories() {
  const { articles } = getPublicEditorialRepositories();
  return articles.listCategories();
}
