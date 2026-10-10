import type {
  Article,
  ArticleDraftInput,
  ArticlePage,
  ArticleQuery,
  Category,
  SocialChannel,
} from "./article";
import type { EntityRepository } from "./entity";
import type { Locale } from "../../locale";
import type {
  DistributionPublication,
  DistributionUpdate,
  MediaAsset,
  MediaUpload,
  NewsletterPage,
  NewsletterQuery,
} from "./editorial-operations";

export interface ArticleRepository {
  listPublished(query: ArticleQuery): Promise<ArticlePage>;
  listForStudio(locale: Locale): Promise<Article[]>;
  findBySlug(slug: string, locale: Locale): Promise<Article | null>;
  findById(id: string, locale: Locale): Promise<Article | null>;
  listCategories(locale: Locale): Promise<Category[]>;
  save(input: ArticleDraftInput): Promise<Article>;
  delete(id: string): Promise<void>;
  setDistributionChannels(id: string, channels: SocialChannel[]): Promise<void>;
}

export interface NewsletterRepository {
  subscribe(
    email: string,
    source: string,
    locale: Locale,
  ): Promise<void>;
  listSubscriptions(query: NewsletterQuery): Promise<NewsletterPage>;
  /** Editors may only unsubscribe; reactivation goes through a fresh double opt-in. */
  updateSubscriptionStatus(id: string, status: "unsubscribed"): Promise<void>;
}

export interface DistributionRepository {
  listPublications(locale: Locale): Promise<DistributionPublication[]>;
  updatePublication(input: DistributionUpdate): Promise<DistributionPublication>;
}

export interface MediaRepository {
  readonly writable: boolean;
  listAssets(): Promise<MediaAsset[]>;
  isAssetReferenced(path: string): Promise<boolean>;
  uploadAsset(input: MediaUpload): Promise<MediaAsset>;
  deleteAsset(path: string): Promise<void>;
}

export interface EditorialRepositories {
  articles: ArticleRepository;
  entities: EntityRepository;
  newsletter: NewsletterRepository;
  distribution: DistributionRepository;
  media: MediaRepository;
  mode: "demo" | "supabase";
}

export type AdminEditorialRepository = ArticleRepository
  & EntityRepository
  & NewsletterRepository
  & DistributionRepository
  & MediaRepository;
