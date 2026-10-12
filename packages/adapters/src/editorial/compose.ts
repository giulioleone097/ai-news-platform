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
import { composePorts, portPart } from "../compose-ports";

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

const articleMembers: Record<keyof ArticleRepository, true> = {
  listPublished: true, listForStudio: true, findBySlug: true, findById: true, findByTranslationKey: true,
  listCategories: true, save: true, saveMany: true, setPublished: true, delete: true, deleteMany: true,
  setDistributionChannels: true,
};
const categoryMembers: Record<keyof CategoryAdminRepository, true> = {
  listCategoryRecords: true, createCategories: true, updateCategories: true, deleteCategories: true,
  countCategoryArticles: true,
};
const entityMembers: Record<keyof EntityRepository, true> = {
  listEntities: true, findEntityBySlug: true, listEntityTimeline: true,
};
const entityAdminMembers: Record<keyof EntityAdminRepository, true> = {
  listEntityRecords: true, createEntities: true, updateEntities: true, deleteEntities: true, countEntityStories: true,
};
const newsletterMembers: Record<keyof NewsletterRepository, true> = {
  subscribe: true, listSubscriptions: true, findSubscription: true, updateSubscriptionStatus: true,
};
const distributionMembers: Record<keyof DistributionRepository, true> = {
  listPublications: true, updatePublication: true,
};
const mediaMembers: Record<keyof MediaRepository, true> = {
  writable: true, listAssets: true, findAsset: true, isAssetReferenced: true, uploadAsset: true, deleteAsset: true,
  deleteAssets: true,
};

/** The single repository that the admin capabilities and the Studio take: every port of the parts on one object. */
export function composeAdminEditorialRepository(parts: EditorialParts): AdminEditorialRepository {
  return composePorts<[
    ArticleRepository,
    CategoryAdminRepository,
    EntityRepository,
    EntityAdminRepository,
    NewsletterRepository,
    DistributionRepository,
    MediaRepository,
  ]>(
    portPart(parts.articles, articleMembers),
    portPart(parts.categories, categoryMembers),
    portPart(parts.entities, entityMembers),
    portPart(parts.entityAdmin, entityAdminMembers),
    portPart(parts.newsletter, newsletterMembers),
    portPart(parts.distribution, distributionMembers),
    portPart(parts.media, mediaMembers),
  );
}
