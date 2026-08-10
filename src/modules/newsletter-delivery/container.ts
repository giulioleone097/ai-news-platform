import "server-only";

import {
  getNewsletterDeliveryEnvironment,
  getPublicSiteUrl,
} from "@/config/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { NewsletterDeliveryConfigurationError } from "./domain";
import { ResendNewsletterProvider } from "./resend-provider";
import {
  NewsletterCampaignService,
  NewsletterDeliveryService,
} from "./service";
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

function campaignService(
  repository: SupabaseNewsletterDeliveryRepository,
  environment: NonNullable<ReturnType<typeof getNewsletterDeliveryEnvironment>>,
) {
  return new NewsletterCampaignService(repository, {
    fromEmail: environment.from,
    replyTo: environment.replyTo,
    suppressionSecret: environment.unsubscribeSecret,
  });
}

export async function getStudioNewsletterCampaignService() {
  const { environment } = requireDeliveryEnvironment();
  const client = await createServerSupabaseClient();
  if (!client) throw new NewsletterDeliveryConfigurationError("Studio persistence is not configured.");
  return campaignService(new SupabaseNewsletterDeliveryRepository(client), environment);
}

export function getAdminNewsletterCampaignService() {
  const { environment } = requireDeliveryEnvironment();
  const client = createServiceSupabaseClient();
  if (!client) throw new NewsletterDeliveryConfigurationError();
  return campaignService(new SupabaseNewsletterDeliveryRepository(client), environment);
}

export function getNewsletterDeliveryService() {
  const { environment, baseUrl } = requireDeliveryEnvironment();
  const client = createServiceSupabaseClient();
  if (!client) throw new NewsletterDeliveryConfigurationError();
  const repository = new SupabaseNewsletterDeliveryRepository(client);
  const provider = new ResendNewsletterProvider({ apiKey: environment.apiKey });
  return new NewsletterDeliveryService(repository, provider, {
    baseUrl,
    fromEmail: environment.from,
    replyTo: environment.replyTo,
    unsubscribeSecret: environment.unsubscribeSecret,
  });
}
