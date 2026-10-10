import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import { getAdminEditorialRepository, getPublicEditorialRepositories } from "@atlasnews/adapters/editorial/container";
import { CapabilityFailure, siteLinks, type CapabilityPorts } from "@atlasnews/contract";

import { createWebCacheInvalidator } from "./revalidate";

const invalidateCache = createWebCacheInvalidator();

/** Builds the ports from the configured adapters; heavy or optional ones load on first use. */
export function createRuntimePorts(): CapabilityPorts {
  return {
    site: siteLinks(getPublicSiteUrl()),
    articles: getPublicEditorialRepositories().articles,
    entities: getPublicEditorialRepositories().entities,
    invalidateCache,

    async publicComments() {
      const { createPublicCommentService } = await import("@atlasnews/adapters/comments/container");
      const service = createPublicCommentService();
      if (!service) throw new Error("Comments are not configured.");
      return service;
    },

    async editorial() {
      try {
        return getAdminEditorialRepository();
      } catch {
        throw new CapabilityFailure("Newsroom persistence is not configured.");
      }
    },

    async moderation() {
      const { createMutationCommentService } = await import("@atlasnews/adapters/comments/container");
      const service = createMutationCommentService();
      if (!service) throw new Error("Comment moderation is not configured.");
      return service;
    },

    async commentNotifications() {
      const { createCommentNotificationDeliveryService } = await import("@atlasnews/adapters/comments/container");
      const service = createCommentNotificationDeliveryService();
      if (!service) throw new Error("Comment notification delivery is not configured.");
      return service;
    },

    async newsletter() {
      const [{ getAdminNewsletterCampaignService, getNewsletterDeliveryService }, { getSupabaseAdminEnvironment }] =
        await Promise.all([
          import("@atlasnews/adapters/newsletter/container"),
          import("@atlasnews/adapters/config/env"),
        ]);
      const admin = getSupabaseAdminEnvironment();
      if (!admin) throw new Error("Newsletter administration is not configured.");
      return {
        campaign: getAdminNewsletterCampaignService(),
        delivery: getNewsletterDeliveryService(),
        authorId: admin.authorId,
      };
    },

    async social() {
      const { createSocialPublishingRuntime } = await import("@atlasnews/adapters/social-publishing/runtime");
      const { service, processor, providers } = createSocialPublishingRuntime();
      return { service, processor, providers };
    },
  };
}
