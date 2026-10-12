import type { Category } from "@atlasnews/core/editorial/domain/article";
import type { DistributionPublication, NewsletterSubscription } from "@atlasnews/core/editorial/domain/editorial-operations";
import type { Locale } from "@atlasnews/core/locale";
import { seedArticles, seedCategories, seedEntities, type SeedEntity } from "../seed";

/** A seed entity whose descriptions may be missing for a locale. */
export type StoredEntity = Omit<SeedEntity, "description"> & { description: Partial<Record<Locale, string>> };

/**
 * What the in-memory editorial ports share: the seed content and its changes. A port holds the store and
 * works on it; `atomic` is the counterpart of a database transaction for the writes that span items.
 */
export class MemoryEditorialStore {
  articles = structuredClone(seedArticles);
  categories: Category[] = structuredClone(seedCategories);
  /** Position of each category by translation key: the order of the seed. */
  categoryPositions = new Map(
    [...new Set(seedCategories.map((category) => category.translationKey))].map((key, index) => [key, index + 1]),
  );
  entities = new Map<string, StoredEntity>(seedEntities.map((entity) => [entity.slug, structuredClone(entity)]));
  subscribers = new Map<string, NewsletterSubscription>();
  publications = new Map<string, DistributionPublication>();

  constructor() {
    for (const article of this.articles) {
      for (const channel of article.distribution) {
        const id = `${article.id}:${channel}`;
        this.publications.set(id, {
          id,
          articleId: article.id,
          articleLocale: article.locale,
          articleSlug: article.slug,
          articleTitle: article.title,
          channel,
          status: "ready",
          message: article.excerpt,
          externalUrl: null,
          scheduledFor: article.scheduledFor,
          publishedAt: null,
          updatedAt: article.updatedAt,
        });
      }
    }
  }

  /**
   * The memory counterpart of a database transaction: the state before the work is restored when the
   * work throws, so a batch never leaves half of its items behind.
   */
  async atomic<T>(work: () => Promise<T> | T): Promise<T> {
    const before = structuredClone({
      articles: this.articles,
      categories: this.categories,
      categoryPositions: this.categoryPositions,
      entities: this.entities,
      publications: this.publications,
    });
    try {
      return await work();
    } catch (error) {
      Object.assign(this, before);
      throw error;
    }
  }

  positionOf(translationKey: string) {
    return this.categoryPositions.get(translationKey) ?? Number.MAX_SAFE_INTEGER;
  }
}
