import { getPublicSiteUrl } from "@atlasnews/adapters/config/env";
import { getAdminEditorialRepository, getPublicEditorialRepositories } from "@atlasnews/adapters/editorial/container";
import { CapabilityFailure, siteLinks, type CapabilityPorts } from "@atlasnews/contract";

import type { AuthenticatedPrincipal } from "./auth";
import { createWebCacheInvalidator } from "./revalidate";

const invalidateCache = createWebCacheInvalidator();

/**
 * Builds the ports from the configured adapters; heavy or optional ones load on first use.
 * Writes are attributed to the signed-in editor's author id; the API key, which names no editor,
 * keeps `ATLASNEWS_MCP_ADMIN_AUTHOR_ID`.
 */
export function createRuntimePorts(principal?: AuthenticatedPrincipal): CapabilityPorts {
  const actorAuthorId = principal?.authorId;
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
        return getAdminEditorialRepository(actorAuthorId);
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
      const [{ getAdminNewsletterCampaignService, getNewsletterDeliveryService }, { getContentMode, getSupabaseAdminEnvironment }] =
        await Promise.all([
          import("@atlasnews/adapters/newsletter/container"),
          import("@atlasnews/adapters/config/env"),
        ]);
      // On Sites every newsroom caller is a signed-in editor with an author.
      const authorId = getContentMode() === "sites" ? actorAuthorId : getSupabaseAdminEnvironment(actorAuthorId)?.authorId;
      if (!authorId) throw new Error("Newsletter administration is not configured.");
      return {
        campaign: getAdminNewsletterCampaignService(),
        delivery: getNewsletterDeliveryService(),
        authorId,
      };
    },

    async contact() {
      const { getContactMessageService } = await import("@atlasnews/adapters/support/container");
      const service = getContactMessageService();
      if (!service) throw new Error("The contact inbox is not configured.");
      return service;
    },

    async team() {
      const { getEditorDirectory } = await import("@atlasnews/adapters/team/container");
      try {
        return getEditorDirectory();
      } catch {
        throw new CapabilityFailure("Team management is not configured.");
      }
    },

    async social() {
      const { createSocialPublishingRuntime } = await import("@atlasnews/adapters/social-publishing/runtime");
      const { service, processor, providers } = createSocialPublishingRuntime();
      return { service, processor, providers };
    },
  };
}
