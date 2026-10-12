import type { AdminEditorialRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { D1Database } from "../sites/cloudflare";
import { composeAdminEditorialRepository, type EditorialParts } from "./compose";
import type { D1EditorialRepositoryOptions } from "./d1/access";
import { D1ArticleRepository } from "./d1/articles";
import { D1CategoryAdminRepository } from "./d1/categories";
import { D1DistributionRepository } from "./d1/distribution";
import { D1EntityRepository } from "./d1/entities";
import { D1EntityAdminRepository } from "./d1/entity-admin";
import { D1MediaRepository } from "./d1/media";
import { D1NewsletterRepository } from "./d1/newsletter";

export type { D1EditorialRepositoryOptions } from "./d1/access";
export { readSitesMediaObject } from "./d1/media";

/**
 * The editorial content of a Site on D1 (articles, categories, entities, distribution) and its media on R2,
 * one class per port in `./d1`. It follows the Supabase adapter together with the Postgres functions that one
 * calls: the batch writes of `content_batches`, `save_article_with_distribution`, `update_distribution_publication`
 * and `is_editorial_media_referenced`. D1 has no interactive transactions, so a multi-statement write is one
 * `batch()`; whatever a statement needs from earlier reads is checked first, and the statements that follow an
 * article UPDATE only apply when that UPDATE did. The adapter runs with full access: for the `public` audience
 * it reproduces what row-level security left to the anonymous reader and refuses every write.
 */
export function createD1EditorialParts(database: D1Database, options: D1EditorialRepositoryOptions): EditorialParts {
  return {
    articles: new D1ArticleRepository(database, options),
    categories: new D1CategoryAdminRepository(database, options),
    entities: new D1EntityRepository(database, options),
    entityAdmin: new D1EntityAdminRepository(database, options),
    newsletter: new D1NewsletterRepository(database, options),
    distribution: new D1DistributionRepository(database, options),
    media: new D1MediaRepository(database, options),
  };
}

export function createD1EditorialRepository(database: D1Database, options: D1EditorialRepositoryOptions): AdminEditorialRepository {
  return composeAdminEditorialRepository(createD1EditorialParts(database, options));
}
