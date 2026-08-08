import type { Article, Category } from "./article";
import type { ArticleRepository } from "./article-repository";

export interface HomeFeed {
  feature: Article;
  latest: Article[];
  spotlight: Article[];
  categories: Category[];
}

export async function getHomeFeed(repository: ArticleRepository): Promise<HomeFeed> {
  const [page, categories] = await Promise.all([
    repository.listPublished({ limit: 9 }),
    repository.listCategories(),
  ]);

  if (!page.items.length) {
    throw new Error("At least one published article is required for the home feed");
  }

  const feature = page.items.find((article) => article.featured) ?? page.items[0];
  const rest = page.items.filter((article) => article.id !== feature.id);

  return {
    feature,
    latest: rest.slice(0, 3),
    spotlight: rest.slice(3, 6),
    categories,
  };
}
