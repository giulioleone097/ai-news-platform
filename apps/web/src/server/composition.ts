import "server-only";

import { getStudioEditorialRepositories as composeStudioEditorialRepositories } from "@atlasnews/adapters/editorial/container";
import { getStudioNewsletterCampaignService as composeStudioNewsletterCampaignService } from "@atlasnews/adapters/newsletter/container";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// The only module that lets web code reach the adapters' composition roots; the
// server-only guard keeps them out of client bundles.
export { getPublicEditorialRepositories } from "@atlasnews/adapters/editorial/container";
export * from "@atlasnews/adapters/comments/container";
export { createCommentNotificationPreference } from "@atlasnews/adapters/comments/notification-preference";
export { getNewsletterDeliveryService } from "@atlasnews/adapters/newsletter/container";
export {
  createSocialPublishingRuntime,
  createWhatsAppWebhookRuntime,
} from "@atlasnews/adapters/social-publishing/runtime";

export const getStudioEditorialRepositories = () =>
  composeStudioEditorialRepositories(createServerSupabaseClient);

export const getStudioNewsletterCampaignService = () =>
  composeStudioNewsletterCampaignService(createServerSupabaseClient);
