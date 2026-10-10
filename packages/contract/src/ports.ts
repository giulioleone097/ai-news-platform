import type { ArticleRepository, AdminEditorialRepository } from "@atlasnews/core/editorial/domain/article-repository";
import type { EntityRepository } from "@atlasnews/core/editorial/domain/entity";
import type { EditorialCacheInvalidator } from "@atlasnews/core/editorial/application/cache-port";
import type { CommentService } from "@atlasnews/core/comments/application/comment-service";
import type { CommentNotificationDeliveryService } from "@atlasnews/core/comments/application/comment-notification-delivery";
import type { NewsletterCampaignService, NewsletterDeliveryService } from "@atlasnews/core/newsletter/application/service";
import type { SocialOutboxProcessor } from "@atlasnews/core/social-publishing/application/outbox-processor";
import type { SocialPublishingService } from "@atlasnews/core/social-publishing/application/social-publishing-service";
import type { SocialProviderRegistry } from "@atlasnews/core/social-publishing/domain/ports";

export type PublicArticleReader = Pick<
  ArticleRepository,
  "listPublished" | "findBySlug" | "listCategories"
>;

export type PublicEntityReader = Pick<
  EntityRepository,
  "listEntities" | "findEntityBySlug" | "listEntityTimeline"
>;

export type PublicCommentReader = Pick<CommentService, "listApproved">;

/**
 * What handlers may use. The delivery app builds it from adapters; resolvers that need
 * configuration (service role, providers) are lazy and reject when it is missing.
 */
export interface CapabilityPorts {
  readonly site: SiteLinks;
  readonly articles: PublicArticleReader;
  readonly entities: PublicEntityReader;
  readonly invalidateCache: EditorialCacheInvalidator;
  publicComments(): Promise<PublicCommentReader>;
  editorial(): Promise<AdminEditorialRepository>;
  moderation(): Promise<CommentService>;
  commentNotifications(): Promise<CommentNotificationDeliveryService>;
  newsletter(): Promise<{
    campaign: NewsletterCampaignService;
    delivery: NewsletterDeliveryService;
    authorId: string;
  }>;
  social(): Promise<{
    service: SocialPublishingService;
    processor: SocialOutboxProcessor;
    providers: SocialProviderRegistry;
  }>;
}

export interface SiteLinks {
  /** An absolute, user-openable URL on the public site. */
  absolute(path: string): string;
}

export function siteLinks(siteUrl: URL): SiteLinks {
  return { absolute: (path) => new URL(path, siteUrl).href };
}
