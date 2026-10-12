import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getContentMode,
  getNewsletterDeliveryEnvironment,
  getPublicSiteUrl,
} from "../config/env";
import { requireSitesBindings } from "../sites/bindings";
import { createServiceSupabaseClient } from "../supabase/service";
import { NewsletterDeliveryConfigurationError } from "@atlasnews/core/newsletter/domain/newsletter";
import { ResendNewsletterProvider } from "./resend-provider";
import {
  NewsletterCampaignService,
  NewsletterDeliveryService,
} from "@atlasnews/core/newsletter/application/service";
import { createD1NewsletterDeliveryRepository } from "./d1-newsletter-delivery-repository";
import type { NewsletterDeliveryRepository } from "@atlasnews/core/newsletter/domain/ports";
import { SupabaseNewsletterDeliveryRepository } from "./supabase-repository";

function requireDeliveryEnvironment() {
  const environment = getNewsletterDeliveryEnvironment();
  if (!environment) throw new NewsletterDeliveryConfigurationError();
  const baseUrl = getPublicSiteUrl();
  if (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:") {
    throw new NewsletterDeliveryConfigurationError("Newsletter links require an HTTPS site URL.");
  }
  return { environment, baseUrl };
}

/** The delivery repository on the Site's D1 database, or the service-role Supabase client elsewhere. */
function serviceRepository() {
  if (getContentMode() === "sites") return createD1NewsletterDeliveryRepository(requireSitesBindings().database);
  const client = createServiceSupabaseClient();
  if (!client) throw new NewsletterDeliveryConfigurationError();
  return new SupabaseNewsletterDeliveryRepository(client);
}

function campaignService(
  repository: NewsletterDeliveryRepository,
  environment: NonNullable<ReturnType<typeof getNewsletterDeliveryEnvironment>>,
) {
  return new NewsletterCampaignService(repository, {
    fromEmail: environment.from,
    replyTo: environment.replyTo,
    suppressionSecret: environment.unsubscribeSecret,
  });
}

/**
 * `createClient` supplies the session-bound Supabase client, which only the delivery app can build. On Sites
 * the D1 binding is the Studio's store, so it is not called.
 */
export async function getStudioNewsletterCampaignService(
  createClient: () => Promise<SupabaseClient | null>,
) {
  const { environment } = requireDeliveryEnvironment();
  if (getContentMode() === "sites") return campaignService(serviceRepository(), environment);
  const client = await createClient();
  if (!client) throw new NewsletterDeliveryConfigurationError("Studio persistence is not configured.");
  return campaignService(new SupabaseNewsletterDeliveryRepository(client), environment);
}

export function getAdminNewsletterCampaignService() {
  const { environment } = requireDeliveryEnvironment();
  return campaignService(serviceRepository(), environment);
}

export function getNewsletterDeliveryService() {
  const { environment, baseUrl } = requireDeliveryEnvironment();
  const repository = serviceRepository();
  const provider = new ResendNewsletterProvider({ apiKey: environment.apiKey });
  return new NewsletterDeliveryService(repository, provider, {
    baseUrl,
    fromEmail: environment.from,
    replyTo: environment.replyTo,
    unsubscribeSecret: environment.unsubscribeSecret,
  });
}
