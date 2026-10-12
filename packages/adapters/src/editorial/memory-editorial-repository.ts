import type { AdminEditorialRepository } from "@atlasnews/core/editorial/domain/article-repository";
import { composeAdminEditorialRepository, type EditorialParts } from "./compose";
import { MemoryArticleRepository } from "./memory/articles";
import { MemoryCategoryAdminRepository } from "./memory/categories";
import { MemoryDistributionRepository } from "./memory/distribution";
import { MemoryEntityRepository } from "./memory/entities";
import { MemoryEntityAdminRepository } from "./memory/entity-admin";
import { MemoryMediaRepository } from "./memory/media";
import { MemoryNewsletterRepository } from "./memory/newsletter";
import { MemoryEditorialStore } from "./memory/store";

/** The demo content in memory (the seed), one class per port in `./memory` over one shared store. */
export function createMemoryEditorialParts(store = new MemoryEditorialStore()): EditorialParts {
  return {
    articles: new MemoryArticleRepository(store),
    categories: new MemoryCategoryAdminRepository(store),
    entities: new MemoryEntityRepository(store),
    entityAdmin: new MemoryEntityAdminRepository(store),
    newsletter: new MemoryNewsletterRepository(store),
    distribution: new MemoryDistributionRepository(store),
    media: new MemoryMediaRepository(store),
  };
}

export function createMemoryEditorialRepository(store?: MemoryEditorialStore): AdminEditorialRepository {
  return composeAdminEditorialRepository(createMemoryEditorialParts(store));
}
