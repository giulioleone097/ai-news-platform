import type { NewsletterDeliveryRepository } from "@atlasnews/core/newsletter/domain/ports";
import type {
  NewsletterCampaignRepository,
  NewsletterOutboxRepository,
  NewsletterProviderEventRepository,
  NewsletterSubscriptionFlowRepository,
} from "@atlasnews/core/newsletter/domain/ports";
import { composePorts, portPart } from "../compose-ports";
import type { D1Database } from "../sites/cloudflare";
import { D1NewsletterCampaignRepository } from "./d1/campaigns";
import { D1NewsletterOutboxRepository } from "./d1/outbox";
import { D1NewsletterProviderEventRepository } from "./d1/provider-events";
import { D1NewsletterSubscriptionFlowRepository } from "./d1/subscription-flow";

// The D1 counterpart of supabase-repository.ts and of the Postgres functions in
// supabase/migrations/20260810130000_newsletter_campaigns.sql, one class per port in `./d1`. D1 has no
// interactive transactions, so each operation reads what it needs to validate, then applies every write as one
// `batch` whose statements re-check their own preconditions: a write that lost a race changes nothing.

const campaignMembers: Record<keyof NewsletterCampaignRepository, true> = {
  listCampaigns: true, getCampaign: true, listRecipients: true, saveDraft: true, deleteDraft: true,
  queueCampaign: true, cancelCampaign: true,
};
const outboxMembers: Record<keyof NewsletterOutboxRepository, true> = {
  claimOutbox: true, startOutboxDelivery: true, completeOutbox: true, failOutbox: true,
};
const providerEventMembers: Record<keyof NewsletterProviderEventRepository, true> = {
  recordProviderEvent: true, registerSuppression: true,
};
const subscriptionFlowMembers: Record<keyof NewsletterSubscriptionFlowRepository, true> = {
  requestSubscription: true, completeSubscriptionConfirmation: true, releaseSubscriptionConfirmation: true,
  confirmSubscription: true, unsubscribe: true, getSubscriptionEmail: true, eraseSubscription: true,
};

export function createD1NewsletterDeliveryRepository(database: D1Database): NewsletterDeliveryRepository {
  return composePorts<[
    NewsletterCampaignRepository,
    NewsletterOutboxRepository,
    NewsletterProviderEventRepository,
    NewsletterSubscriptionFlowRepository,
  ]>(
    portPart<NewsletterCampaignRepository>(new D1NewsletterCampaignRepository(database), campaignMembers),
    portPart<NewsletterOutboxRepository>(new D1NewsletterOutboxRepository(database), outboxMembers),
    portPart<NewsletterProviderEventRepository>(new D1NewsletterProviderEventRepository(database), providerEventMembers),
    portPart<NewsletterSubscriptionFlowRepository>(new D1NewsletterSubscriptionFlowRepository(database), subscriptionFlowMembers),
  );
}
