import type {
  AdminEditorialRepository,
  ArticleRepository,
  DistributionRepository,
  EditorialRepositories,
  MediaRepository,
  NewsletterRepository,
} from "@atlasnews/core/editorial/domain/article-repository";
import type { CategoryAdminRepository } from "@atlasnews/core/editorial/domain/category";
import type { EntityAdminRepository, EntityRepository } from "@atlasnews/core/editorial/domain/entity";

/** One implementation per port; a backend builds these and the composition root assembles what the apps need. */
export interface EditorialParts {
  articles: ArticleRepository;
  categories: CategoryAdminRepository;
  entities: EntityRepository;
  entityAdmin: EntityAdminRepository;
  newsletter: NewsletterRepository;
  distribution: DistributionRepository;
  media: MediaRepository;
}

/** What the public site reads: the ports, not the admin ones. */
export function toEditorialRepositories(parts: EditorialParts, mode: EditorialRepositories["mode"]): EditorialRepositories {
  const { articles, entities, newsletter, distribution, media } = parts;
  return { articles, entities, newsletter, distribution, media, mode };
}

/**
 * The members of every port, spelled out. A `Record<keyof Port, true>` must name each member and only members,
 * so a port that gains a method fails to compile here until the composition knows it.
 */
const members: { [Name in keyof EditorialParts]: Record<keyof EditorialParts[Name], true> } = {
  articles: {
    listPublished: true, listForStudio: true, findBySlug: true, findById: true, findByTranslationKey: true,
    listCategories: true, save: true, saveMany: true, setPublished: true, delete: true, deleteMany: true,
    setDistributionChannels: true,
  },
  categories: {
    listCategoryRecords: true, createCategories: true, updateCategories: true, deleteCategories: true,
    countCategoryArticles: true,
  },
  entities: { listEntities: true, findEntityBySlug: true, listEntityTimeline: true },
  entityAdmin: {
    listEntityRecords: true, createEntities: true, updateEntities: true, deleteEntities: true, countEntityStories: true,
  },
  newsletter: { subscribe: true, listSubscriptions: true, findSubscription: true, updateSubscriptionStatus: true },
  distribution: { listPublications: true, updatePublication: true },
  media: {
    writable: true, listAssets: true, findAsset: true, isAssetReferenced: true, uploadAsset: true, deleteAsset: true,
    deleteAssets: true,
  },
};

/**
 * The single repository that the admin capabilities and the Studio take: every port's members on one object,
 * each method bound to the part that implements it. No two ports may share a name, so no part is shadowed,
 * and a part's own helpers stay out of sight.
 */
export function composeAdminEditorialRepository(parts: EditorialParts): AdminEditorialRepository {
  const composed: Record<string, unknown> = {};
  for (const [port, names] of Object.entries(members)) {
    const part = parts[port as keyof EditorialParts] as unknown as Record<string, unknown>;
    for (const name of Object.keys(names)) {
      if (name in composed) throw new Error(`Two editorial ports define ${name}`);
      const member = part[name];
      if (typeof member === "function") composed[name] = member.bind(part);
      else Object.defineProperty(composed, name, { enumerable: true, get: () => part[name] });
    }
  }
  return composed as unknown as AdminEditorialRepository;
}
